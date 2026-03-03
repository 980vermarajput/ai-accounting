/**
 * Smart conversation context management with intelligent token trimming
 * Handles chat sessions, message storage, and context optimization for AI
 */

import { prisma } from "./prisma";
import { estimateTokens } from "./token-usage";

// ─── Types ────────────────────────────────────────────

export interface ChatSession {
  id: string;
  firmId: string;
  userId: string;
  clientId?: string;
  title?: string;
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
  isActive: boolean;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
  tokensUsed?: number;
  clientId?: string;
  searchResults?: number;
  toolsUsed?: string[];
}

export interface ConversationContext {
  session: ChatSession;
  messages: ChatMessage[];
  contextString: string;
  totalTokens: number;
  trimmedCount: number;
}

// ─── Configuration ────────────────────────────────────

const DEFAULT_SESSION_DURATION_HOURS = 2;
const MAX_CONTEXT_TOKENS = 3000; // Conservative limit for context
const MIN_MESSAGES_TO_KEEP = 2; // Always keep last user+assistant pair
const MAX_MESSAGES_TO_CONSIDER = 20; // Don't look back more than 20 messages

// ─── Session Management ───────────────────────────────

/**
 * Get or create a chat session with automatic cleanup
 */
export async function getOrCreateSession(
  sessionId: string | undefined,
  userId: string,
  firmId: string,
  clientId?: string
): Promise<ChatSession> {
  if (sessionId) {
    // Try to get existing session
    const existing = await prisma.chatSession.findFirst({
      where: {
        id: sessionId,
        userId,
        firmId,
        isActive: true,
        expiresAt: { gt: new Date() }
      }
    });

    if (existing) {
      // Update last activity
      const updated = await prisma.chatSession.update({
        where: { id: sessionId },
        data: {
          lastActivity: new Date(),
          expiresAt: new Date(Date.now() + DEFAULT_SESSION_DURATION_HOURS * 60 * 60 * 1000)
        }
      });

      return {
        id: updated.id,
        firmId: updated.firmId,
        userId: updated.userId,
        clientId: updated.clientId || undefined,
        title: updated.title || undefined,
        createdAt: updated.createdAt,
        lastActivity: updated.lastActivity,
        expiresAt: updated.expiresAt,
        isActive: updated.isActive
      };
    }
  }

  // Create new session
  const expiresAt = new Date(Date.now() + DEFAULT_SESSION_DURATION_HOURS * 60 * 60 * 1000);

  const newSession = await prisma.chatSession.create({
    data: {
      firmId,
      userId,
      clientId,
      expiresAt,
      lastActivity: new Date(),
      isActive: true
    }
  });

  return {
    id: newSession.id,
    firmId: newSession.firmId,
    userId: newSession.userId,
    clientId: newSession.clientId || undefined,
    title: newSession.title || undefined,
    createdAt: newSession.createdAt,
    lastActivity: newSession.lastActivity,
    expiresAt: newSession.expiresAt,
    isActive: newSession.isActive
  };
}

/**
 * Save user and assistant messages to session
 */
export async function saveMessages(
  sessionId: string,
  userQuery: string,
  assistantResponse: string,
  metadata: {
    clientId?: string;
    tokensUsed?: number;
    searchResults?: number;
    toolsUsed?: string[];
  } = {}
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Save user message
    await tx.chatMessage.create({
      data: {
        sessionId,
        role: 'user',
        content: userQuery,
        clientId: metadata.clientId,
        tokensUsed: estimateTokens(userQuery)
      }
    });

    // Save assistant message
    await tx.chatMessage.create({
      data: {
        sessionId,
        role: 'assistant',
        content: assistantResponse,
        clientId: metadata.clientId,
        tokensUsed: metadata.tokensUsed || 0,
        searchResults: metadata.searchResults,
        toolsUsed: metadata.toolsUsed || []
      }
    });

    // Auto-generate session title from first user message
    const messageCount = await tx.chatMessage.count({
      where: { sessionId, role: 'user' }
    });

    if (messageCount === 1) {
      const title = generateSessionTitle(userQuery);
      await tx.chatSession.update({
        where: { id: sessionId },
        data: { title }
      });
    }
  });
}

/**
 * Get conversation context with smart token management
 */
export async function getConversationContext(
  sessionId: string,
  maxTokens: number = MAX_CONTEXT_TOKENS
): Promise<ConversationContext> {
  // Get session
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: MAX_MESSAGES_TO_CONSIDER
      }
    }
  });

  if (!session) {
    throw new Error("Session not found");
  }

  // Reverse to chronological order
  const allMessages = session.messages.reverse();

  // Convert to our format
  const messages: ChatMessage[] = allMessages.map(msg => ({
    id: msg.id,
    sessionId: msg.sessionId,
    role: msg.role as 'user' | 'assistant' | 'system',
    content: msg.content,
    createdAt: msg.createdAt,
    tokensUsed: msg.tokensUsed || undefined,
    clientId: msg.clientId || undefined,
    searchResults: msg.searchResults || undefined,
    toolsUsed: msg.toolsUsed
  }));

  // Smart trimming
  const { contextMessages, totalTokens, trimmedCount } = smartTrimMessages(messages, maxTokens);

  // Build context string
  const contextString = contextMessages.length > 0
    ? `Previous conversation:\n${contextMessages.map(msg =>
        `${msg.role}: ${msg.content}`
      ).join('\n')}\n\n`
    : '';

  return {
    session: {
      id: session.id,
      firmId: session.firmId,
      userId: session.userId,
      clientId: session.clientId || undefined,
      title: session.title || undefined,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      expiresAt: session.expiresAt,
      isActive: session.isActive
    },
    messages: contextMessages,
    contextString,
    totalTokens,
    trimmedCount
  };
}

// ─── Smart Context Trimming ───────────────────────────

interface TrimResult {
  contextMessages: ChatMessage[];
  totalTokens: number;
  trimmedCount: number;
}

/**
 * Intelligently trim conversation history to fit within token limits
 * Prioritizes recent messages and complete user-assistant pairs
 */
function smartTrimMessages(messages: ChatMessage[], maxTokens: number): TrimResult {
  if (messages.length === 0) {
    return { contextMessages: [], totalTokens: 0, trimmedCount: 0 };
  }

  // Work backwards from most recent
  const result: ChatMessage[] = [];
  let totalTokens = 0;
  let trimmedCount = 0;

  // Always try to include the last MIN_MESSAGES_TO_KEEP
  const minToKeep = Math.min(MIN_MESSAGES_TO_KEEP, messages.length);

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message) continue; // Skip if message is undefined
    const messageTokens = message.tokensUsed || estimateTokens(message.content || '');

    // Check if adding this message would exceed the limit
    if (totalTokens + messageTokens > maxTokens) {
      // If we haven't kept the minimum required messages, force include them
      if (result.length < minToKeep) {
        // Find the least important message to remove
        const oldestIndex = findLeastImportantMessage(result);
        if (oldestIndex !== -1 && result[oldestIndex]) {
          const removed = result.splice(oldestIndex, 1)[0];
          if (removed) {
            totalTokens -= (removed.tokensUsed || estimateTokens(removed.content || ''));
            trimmedCount++;
          }
        }
      } else {
        trimmedCount++;
        continue;
      }
    }

    result.unshift(message);
    totalTokens += messageTokens;

    // Stop if we've hit the minimum and are over budget
    if (result.length >= minToKeep && totalTokens + messageTokens > maxTokens) {
      break;
    }
  }

  return {
    contextMessages: result,
    totalTokens,
    trimmedCount
  };
}

/**
 * Find the least important message to remove (prefer system messages, then older messages)
 */
function findLeastImportantMessage(messages: ChatMessage[]): number {
  // Prefer to remove system messages first
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (message && message.role === 'system') return i;
  }

  // Then remove the oldest message (make sure it exists)
  return messages.length > 0 ? 0 : -1;
}

// ─── Utility Functions ─────────────────────────────────

/**
 * Generate a concise title from the first user message
 */
function generateSessionTitle(query: string): string {
  // Clean and truncate
  const cleaned = query
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length <= 50) return cleaned;

  // Find a good breaking point
  const words = cleaned.split(' ');
  let title = '';

  for (const word of words) {
    if (title.length + word.length + 1 > 47) break;
    title += (title ? ' ' : '') + word;
  }

  return title + '...';
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.chatSession.updateMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { lastActivity: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } // 24 hours
      ]
    },
    data: { isActive: false }
  });

  return result.count;
}

/**
 * Get session list for a user (for potential UI)
 */
export async function getUserSessions(
  userId: string,
  firmId: string,
  limit: number = 20
): Promise<ChatSession[]> {
  const sessions = await prisma.chatSession.findMany({
    where: {
      userId,
      firmId,
      isActive: true,
      expiresAt: { gt: new Date() }
    },
    orderBy: { lastActivity: 'desc' },
    take: limit
  });

  return sessions.map(session => ({
    id: session.id,
    firmId: session.firmId,
    userId: session.userId,
    clientId: session.clientId || undefined,
    title: session.title || undefined,
    createdAt: session.createdAt,
    lastActivity: session.lastActivity,
    expiresAt: session.expiresAt,
    isActive: session.isActive
  }));
}