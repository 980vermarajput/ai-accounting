# AI Accounting Assistant - Comprehensive Testing Guide

## Table of Contents
1. [Overview](#overview)
2. [Core Functionalities](#core-functionalities)
3. [Authentication & Team Management](#authentication--team-management)
4. [Document Processing & AI Features](#document-processing--ai-features)
5. [Test Scenarios](#test-scenarios)
6. [API Testing](#api-testing)
7. [UI/UX Testing](#uiux-testing)
8. [Performance Testing](#performance-testing)

---

## Overview

This guide covers comprehensive testing of the AI Accounting Assistant application, including all core functionalities, edge cases, and integration points.

**Application Stack:**
- Frontend: Next.js 14, TypeScript, Tailwind CSS
- Backend: Express.js, TypeScript, Prisma ORM
- Database: PostgreSQL
- Authentication: Google OAuth 2.0
- AI: OpenAI GPT-4, RAG (Retrieval Augmented Generation)
- Document Processing: Gmail API integration
- Real-time: Server-sent events

**Key Features:**
- Multi-tenant firm management
- Team collaboration with role-based access
- AI-powered document analysis and chat
- Email automation and drafting
- Client and deadline management
- Conversation memory with smart token management

---

## Core Functionalities

### 1. Authentication System
**Features:**
- Google OAuth 2.0 integration
- JWT token management with HttpOnly cookies
- Session persistence and blacklisting
- Role-based access control (Admin/Member)

**Test Points:**
- [ ] Google OAuth consent flow
- [ ] JWT token validation and expiration
- [ ] Session persistence across browser restarts
- [ ] Role-based route protection
- [ ] Logout and session cleanup

### 2. Team & Firm Management
**Features:**
- Multi-tenant architecture
- Team invite system with secure tokens
- Role management (Admin/Member permissions)
- Firm-scoped data isolation

**Test Points:**
- [ ] Firm creation during signup
- [ ] Team invite generation and acceptance
- [ ] Role promotion/demotion
- [ ] Member removal
- [ ] Data isolation between firms

### 3. Document Processing
**Features:**
- Gmail integration for document sync
- AI-powered document classification
- Intelligent parsing of financial documents
- Vector embeddings for semantic search

**Test Points:**
- [ ] Gmail OAuth and sync setup
- [ ] Document classification accuracy
- [ ] Parsing of various document types (invoices, balance sheets, etc.)
- [ ] Search functionality
- [ ] Document assignment to clients

### 4. AI Assistant & Chat
**Features:**
- Conversation memory with token management
- RAG system with firm knowledge base
- Real-time AI tools for firm analytics
- Context-aware responses

**Test Points:**
- [ ] Chat message persistence
- [ ] Conversation context continuity
- [ ] Firm-specific knowledge retrieval
- [ ] AI tool execution (analytics, client details)
- [ ] Token limit management (3000 token limit)

### 5. Email Automation
**Features:**
- AI-powered email drafting
- Gmail integration for sending
- Template management
- Client communication tracking

**Test Points:**
- [ ] Email draft generation
- [ ] Gmail send integration
- [ ] Template creation and usage
- [ ] Email thread tracking

### 6. Client & Deadline Management
**Features:**
- Client database with document tracking
- Deadline calendar with notifications
- Client-document association
- Activity timeline

**Test Points:**
- [ ] Client creation and management
- [ ] Deadline scheduling and alerts
- [ ] Document-client associations
- [ ] Activity logging

---

## Authentication & Team Management

### Test Scenario 1: Complete Authentication Flow
1. **Initial Signup**
   - Visit application
   - Click "Sign in with Google"
   - Complete OAuth consent
   - Verify firm creation
   - Check dashboard access

2. **Team Invite Flow**
   - Create invite as admin
   - Test invite preview (public endpoint)
   - Accept invite with different email
   - Verify role assignment
   - Check team member list

3. **Role Management**
   - Promote member to admin
   - Verify permission changes
   - Test admin-only features
   - Demote back to member
   - Test member restrictions

### Test Scenario 2: Security & Edge Cases
1. **Token Management**
   - Test JWT expiration
   - Verify logout clears sessions
   - Test concurrent login sessions
   - Check token blacklisting

2. **Invite Security**
   - Test expired invites
   - Verify email-locked invites
   - Test invite revocation
   - Check duplicate invite handling

---

## Document Processing & AI Features

### Test Scenario 3: Document Sync & Processing
1. **Gmail Integration**
   - Connect Gmail account
   - Trigger document sync
   - Verify document detection
   - Check classification accuracy

2. **Document Types Testing**
   Test with various document types:
   - Balance Sheets
   - P&L Statements
   - Invoices
   - GST Returns
   - Income Tax Returns
   - Bank Statements
   - Salary Registers

3. **AI Classification**
   - Verify correct document type detection
   - Check entity/client extraction
   - Test date range parsing
   - Validate financial data extraction

### Test Scenario 4: AI Chat & Conversation Memory
1. **Basic Chat Functionality**
   - Send simple accounting questions
   - Verify AI responses use firm context
   - Test document references
   - Check response accuracy

2. **Conversation Memory**
   - Start conversation
   - Ask follow-up questions
   - Refresh page/reload
   - Verify conversation continuity
   - Test token limit management (3000 tokens)

3. **Real-time AI Tools**
   - Ask for firm analytics
   - Request client details
   - Test document assignment suggestions
   - Verify tool execution logs

### Test Scenario 5: Advanced AI Features
1. **RAG System**
   - Ask questions about specific documents
   - Test cross-document queries
   - Verify knowledge base updates
   - Check semantic search accuracy

2. **Context Management**
   - Test long conversations
   - Verify intelligent token trimming
   - Check message prioritization
   - Test session expiration (2 hours)

---

## Test Scenarios

### Critical Path Testing

#### Scenario A: New Firm Onboarding
```
1. User signs up → Firm created
2. Connect Gmail → Documents synced
3. AI processes documents → Knowledge base built
4. User chats with AI → Gets firm-specific insights
5. User invites team member → Member joins successfully
Expected: Complete onboarding flow works end-to-end
```

#### Scenario B: Multi-User Collaboration
```
1. Admin creates multiple invites
2. Members join from different emails
3. Each member syncs their Gmail
4. All members can chat with shared knowledge
5. Admin manages team permissions
Expected: Proper data sharing and access control
```

#### Scenario C: Heavy Document Processing
```
1. User with large Gmail account (100+ documents)
2. Sync all documents
3. Test AI classification performance
4. Query across multiple document types
5. Verify search and retrieval speed
Expected: System handles large datasets efficiently
```

### Edge Case Testing

#### Scenario D: Error Handling
```
1. Gmail API rate limiting
2. Large document uploads
3. Network interruptions during sync
4. Malformed document content
5. AI service timeouts
Expected: Graceful error handling and recovery
```

#### Scenario E: Security Testing
```
1. Attempt to access other firm's data
2. Test with expired JWT tokens
3. Try admin actions as member
4. Test invite tampering
5. SQL injection attempts
Expected: All unauthorized access blocked
```

---

## API Testing

### Authentication Endpoints
```bash
# Test OAuth flow
GET /api/auth/google
GET /api/auth/google/callback?code=...

# Test current user
GET /api/auth/me
Authorization: Bearer <token>

# Test logout
POST /api/auth/logout
Authorization: Bearer <token>
```

### Team Management
```bash
# List team members
GET /api/team/members
Authorization: Bearer <admin-token>

# Create invite
POST /api/team/invites
Content-Type: application/json
Authorization: Bearer <admin-token>
{
  "email": "test@example.com",
  "role": "member"
}

# Test invite preview (public)
GET /api/team/invites/preview/<token>

# Update member role
PATCH /api/team/members/<userId>/role
Content-Type: application/json
Authorization: Bearer <admin-token>
{
  "role": "admin"
}
```

### Chat & AI Features
```bash
# Send chat message
POST /api/chat
Content-Type: application/json
Authorization: Bearer <token>
{
  "message": "What are our Q1 revenues?",
  "sessionId": "optional-session-id"
}

# Get firm analytics
GET /api/dashboard/analytics
Authorization: Bearer <token>

# Sync documents
POST /api/sync/gmail
Authorization: Bearer <token>
```

### Document Management
```bash
# List documents
GET /api/documents
Authorization: Bearer <token>

# Get document details
GET /api/documents/<id>
Authorization: Bearer <token>

# Assign document to client
PATCH /api/documents/<id>/assign
Content-Type: application/json
Authorization: Bearer <token>
{
  "clientId": "<client-id>"
}
```

---

## UI/UX Testing

### Design System Testing
1. **Consistent Styling**
   - [ ] Blue-purple gradient theme throughout
   - [ ] Glassmorphism effects on cards
   - [ ] Professional grey tones
   - [ ] Consistent spacing and typography

2. **Responsive Design**
   - [ ] Desktop (1920x1080)
   - [ ] Laptop (1366x768)
   - [ ] Tablet (768px width)
   - [ ] Mobile (375px width)

3. **Navigation & Flow**
   - [ ] Sidebar navigation works consistently
   - [ ] Active states and focus management
   - [ ] Breadcrumb navigation
   - [ ] Back button functionality

### Accessibility Testing
1. **Keyboard Navigation**
   - [ ] Tab order is logical
   - [ ] All interactive elements accessible
   - [ ] Focus indicators visible
   - [ ] Escape key closes modals

2. **Screen Reader Support**
   - [ ] Semantic HTML structure
   - [ ] ARIA labels where needed
   - [ ] Alt text for images
   - [ ] Form labels properly associated

---

## Performance Testing

### Load Testing Scenarios
1. **High Document Volume**
   - Test with 1000+ documents
   - Measure sync time
   - Check memory usage
   - Verify UI responsiveness

2. **Concurrent Users**
   - Multiple team members online
   - Simultaneous chat sessions
   - Parallel document processing
   - Database connection pooling

3. **AI Performance**
   - Response time for chat queries
   - Token usage optimization
   - Vector search speed
   - Context retrieval efficiency

### Monitoring Points
- Database query performance
- API response times
- Frontend bundle size
- Memory usage patterns
- Error rates and exceptions

---

## Testing Checklist

### Before Each Release
- [ ] All authentication flows work
- [ ] Team management functions correctly
- [ ] Document sync and processing
- [ ] AI chat responds accurately
- [ ] Email features functional
- [ ] UI is consistent and responsive
- [ ] No console errors
- [ ] API endpoints return expected responses
- [ ] Database migrations successful
- [ ] Environment variables configured

### Security Checklist
- [ ] JWT tokens properly validated
- [ ] CORS configured correctly
- [ ] No sensitive data in client code
- [ ] SQL injection protection
- [ ] XSS prevention measures
- [ ] Rate limiting in place
- [ ] HTTPS enforced in production

### Data Integrity
- [ ] Firm data isolation maintained
- [ ] Document assignments accurate
- [ ] Conversation history preserved
- [ ] Team member roles enforced
- [ ] Audit logs complete

---

## Common Issues & Solutions

### Authentication Issues
**Problem**: "Missing or invalid Authorization header"
**Solution**: Check JWT token expiration, logout and login again

**Problem**: Role-based access denied after promotion
**Solution**: User must logout and login to refresh JWT token

### Document Processing Issues
**Problem**: Gmail sync fails
**Solution**: Re-authorize Gmail permissions, check API quotas

**Problem**: AI misclassifies documents
**Solution**: Verify document format, check AI model prompts

### Performance Issues
**Problem**: Slow chat responses
**Solution**: Check vector database performance, optimize context retrieval

**Problem**: UI lag with many documents
**Solution**: Implement pagination, optimize database queries

---

*Last Updated: March 2026*
*Version: 1.0*