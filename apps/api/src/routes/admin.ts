/**
 * Admin utility routes for maintenance tasks
 */

import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import type { ApiResponse } from "@ai-accounting/shared";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limiter";
import { prisma } from "../lib/prisma";
import { matchesClientEmail } from "../lib/email-utils";
import { updateFirmSnapshot } from "../lib/firm-snapshot";
import { cleanupExpiredSessions } from "../lib/chat-context";

export const adminRouter: Router = Router();

adminRouter.use(requireAuth);
adminRouter.use(rateLimit);

// ─── GET /api/admin/document-stats — check document assignment status ───
adminRouter.get(
  "/document-stats",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.user!;

      // Get total document counts
      const totalDocs = await prisma.document.count({
        where: { firmId }
      });

      const unassignedDocs = await prisma.document.count({
        where: { firmId, clientId: null }
      });

      const assignedDocs = totalDocs - unassignedDocs;

      // Get client assignment breakdown
      const clientAssignments = await prisma.client.findMany({
        where: { firmId },
        select: {
          id: true,
          name: true,
          emailDomain: true,
          _count: {
            select: { documents: true }
          }
        }
      });

      // Get some sample unassigned documents
      const sampleUnassigned = await prisma.document.findMany({
        where: { firmId, clientId: null },
        select: {
          id: true,
          filename: true,
          source: true,
          textExcerpt: true,
          sourceDate: true
        },
        take: 5,
        orderBy: { sourceDate: 'desc' }
      });

      const response: ApiResponse = {
        success: true,
        data: {
          totals: {
            total: totalDocs,
            assigned: assignedDocs,
            unassigned: unassignedDocs
          },
          clientBreakdown: clientAssignments.map(client => ({
            name: client.name,
            emailDomain: client.emailDomain,
            documentCount: client._count.documents
          })),
          sampleUnassigned: sampleUnassigned.map(doc => ({
            filename: doc.filename,
            source: doc.source,
            excerpt: doc.textExcerpt?.substring(0, 100),
            date: doc.sourceDate
          }))
        }
      };

      res.json(response);
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/admin/cleanup-sessions — clean up expired chat sessions ───
adminRouter.post(
  "/cleanup-sessions",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cleanedCount = await cleanupExpiredSessions();

      const response: ApiResponse = {
        success: true,
        data: {
          message: `Cleaned up ${cleanedCount} expired chat sessions`,
          cleanedCount
        }
      };

      res.json(response);
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/admin/reassign-clients — retroactively assign clients to documents ───
adminRouter.post(
  "/reassign-clients",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.user!;

      // Get all clients with email domains
      const clients = await prisma.client.findMany({
        where: {
          firmId,
          emailDomain: { not: null }
        },
        select: { id: true, name: true, emailDomain: true }
      });

      if (clients.length === 0) {
        const response: ApiResponse = {
          success: true,
          data: { message: "No clients with email domains found", assigned: 0 }
        };
        return res.json(response);
      }

      let totalAssigned = 0;
      const results: Array<{ client: string; assigned: number }> = [];

      // Process each client
      for (const client of clients) {
        if (!client.emailDomain) continue;

        let assignedForClient = 0;
        const emailDomain = client.emailDomain.toLowerCase();

        if (emailDomain.includes('@')) {
          // It's a specific email address - match in filename or text excerpt
          const updateResult = await prisma.document.updateMany({
            where: {
              firmId,
              clientId: null,
              OR: [
                { filename: { contains: emailDomain, mode: "insensitive" } },
                { textExcerpt: { contains: emailDomain, mode: "insensitive" } },
              ]
            },
            data: { clientId: client.id }
          });
          assignedForClient = updateResult.count;
        } else {
          // It's a domain - match emails from that domain
          const domainPattern = `@${emailDomain.replace(/^@/, '')}`;
          const updateResult = await prisma.document.updateMany({
            where: {
              firmId,
              clientId: null,
              OR: [
                { filename: { contains: domainPattern, mode: "insensitive" } },
                { textExcerpt: { contains: domainPattern, mode: "insensitive" } },
              ]
            },
            data: { clientId: client.id }
          });
          assignedForClient = updateResult.count;
        }

        results.push({
          client: `${client.name} (${client.emailDomain})`,
          assigned: assignedForClient
        });
        totalAssigned += assignedForClient;
      }

      const response: ApiResponse = {
        success: true,
        data: {
          message: `Successfully assigned ${totalAssigned} documents to clients`,
          totalAssigned,
          results
        }
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/admin/test-email-matching — test email domain matching logic ───
adminRouter.post(
  "/test-email-matching",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { emails, clientEmailDomain } = req.body as {
        emails: string[];
        clientEmailDomain: string;
      };

      if (!emails || !Array.isArray(emails) || !clientEmailDomain) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: "INVALID_REQUEST",
            message: "emails (array) and clientEmailDomain (string) are required"
          }
        };
        return res.status(400).json(response);
      }

      const matches = matchesClientEmail(emails, clientEmailDomain);

      const response: ApiResponse = {
        success: true,
        data: {
          emails,
          clientEmailDomain,
          matches,
          explanation: clientEmailDomain.includes('@')
            ? `Exact match required for email: ${clientEmailDomain}`
            : `Domain match for: ${clientEmailDomain} (matches any @${clientEmailDomain.replace(/^@/, '')} emails)`
        }
      };

      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/admin/update-firm-snapshot — refresh firm knowledge snapshot ───
adminRouter.post(
  "/update-firm-snapshot",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.user!;

      await updateFirmSnapshot(firmId);

      const response: ApiResponse = {
        success: true,
        data: {
          message: "Firm knowledge snapshot updated successfully"
        }
      };

      res.json(response);
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/admin/cleanup-sessions — clean up expired chat sessions ───
adminRouter.post(
  "/cleanup-sessions",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cleanedCount = await cleanupExpiredSessions();

      const response: ApiResponse = {
        success: true,
        data: {
          message: `Cleaned up ${cleanedCount} expired chat sessions`,
          cleanedCount
        }
      };

      res.json(response);
    } catch (err) {
      next(err);
    }
  }
);