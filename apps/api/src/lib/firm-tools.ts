/**
 * AI Tools for firm analytics and statistics
 * These functions can be called by the LLM to get real-time firm data
 */

import { prisma } from "./prisma";

export interface FirmAnalytics {
  firmInfo: {
    name: string;
    totalClients: number;
    totalDocuments: number;
    documentsAssigned: number;
    documentsUnassigned: number;
    assignmentRate: number;
  };
  clientBreakdown: Array<{
    name: string;
    emailDomain?: string;
    documentCount: number;
    lastCommunicationDate?: string;
    daysSinceLastCommunication?: number;
  }>;
  documentStats: {
    bySource: Record<string, number>;
    byStatus: Record<string, number>;
  };
  unassignedDocuments: {
    count: number;
    recentSamples: Array<{
      filename: string;
      source: string;
      date: string;
      excerpt?: string;
    }>;
  };
}

/**
 * Get comprehensive firm analytics and statistics
 * This is called by the LLM to answer questions about firm-wide metrics
 */
export async function getFirmAnalytics(firmId: string): Promise<FirmAnalytics> {
  // Get firm basic info
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { name: true }
  });

  if (!firm) {
    throw new Error("Firm not found");
  }

  // Get core statistics in parallel
  const [
    totalClients,
    totalDocuments,
    documentsAssigned,
    documentsUnassigned
  ] = await Promise.all([
    prisma.client.count({ where: { firmId } }),
    prisma.document.count({ where: { firmId } }),
    prisma.document.count({ where: { firmId, clientId: { not: null } } }),
    prisma.document.count({ where: { firmId, clientId: null } })
  ]);

  // Get client breakdown with document counts
  const clients = await prisma.client.findMany({
    where: { firmId },
    select: {
      name: true,
      emailDomain: true,
      _count: {
        select: { documents: true }
      }
    },
    orderBy: {
      documents: { _count: 'desc' }
    }
  });

  // Get last communication for each client
  const clientsWithLastComm = await Promise.all(
    clients.map(async (client) => {
      const clientRecord = await prisma.client.findFirst({
        where: { firmId, name: client.name },
        select: { id: true }
      });

      const lastDoc = await prisma.document.findFirst({
        where: {
          firmId,
          clientId: clientRecord?.id
        },
        orderBy: { sourceDate: 'desc' },
        select: { sourceDate: true }
      });

      const daysSince = lastDoc?.sourceDate
        ? Math.floor((Date.now() - lastDoc.sourceDate.getTime()) / (1000 * 60 * 60 * 24))
        : undefined;

      return {
        name: client.name,
        emailDomain: client.emailDomain || undefined,
        documentCount: client._count.documents,
        lastCommunicationDate: lastDoc?.sourceDate.toISOString(),
        daysSinceLastCommunication: daysSince
      };
    })
  );

  // Get document statistics
  const [sourceStats, statusStats] = await Promise.all([
    prisma.document.groupBy({
      where: { firmId },
      by: ['source'],
      _count: { source: true }
    }),
    prisma.document.groupBy({
      where: { firmId },
      by: ['status'],
      _count: { status: true }
    })
  ]);

  // Get recent unassigned documents sample
  const unassignedSample = await prisma.document.findMany({
    where: { firmId, clientId: null },
    orderBy: { sourceDate: 'desc' },
    take: 5,
    select: {
      filename: true,
      source: true,
      sourceDate: true,
      textExcerpt: true
    }
  });

  const assignmentRate = totalDocuments > 0
    ? Math.round((documentsAssigned / totalDocuments) * 100)
    : 0;

  return {
    firmInfo: {
      name: firm.name,
      totalClients,
      totalDocuments,
      documentsAssigned,
      documentsUnassigned,
      assignmentRate
    },
    clientBreakdown: clientsWithLastComm,
    documentStats: {
      bySource: sourceStats.reduce((acc, stat) => {
        acc[stat.source] = stat._count.source;
        return acc;
      }, {} as Record<string, number>),
      byStatus: statusStats.reduce((acc, stat) => {
        acc[stat.status] = stat._count.status;
        return acc;
      }, {} as Record<string, number>)
    },
    unassignedDocuments: {
      count: documentsUnassigned,
      recentSamples: unassignedSample.map(doc => ({
        filename: doc.filename,
        source: doc.source,
        date: doc.sourceDate.toISOString().split('T')[0],
        excerpt: doc.textExcerpt?.substring(0, 100)
      }))
    }
  };
}

/**
 * Get detailed client information including recent activity
 */
export async function getClientDetails(firmId: string, clientName: string) {
  const client = await prisma.client.findFirst({
    where: { firmId, name: { contains: clientName, mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      identifier: true,
      emailDomain: true,
      documents: {
        take: 10,
        orderBy: { sourceDate: 'desc' },
        select: {
          filename: true,
          source: true,
          status: true,
          sourceDate: true,
          summary: true
        }
      },
      _count: {
        select: { documents: true, queries: true }
      }
    }
  });

  if (!client) {
    return null;
  }

  return {
    client: {
      name: client.name,
      identifier: client.identifier,
      emailDomain: client.emailDomain
    },
    stats: {
      totalDocuments: client._count.documents,
      totalQueries: client._count.queries
    },
    recentDocuments: client.documents.map(doc => ({
      filename: doc.filename,
      source: doc.source,
      status: doc.status,
      date: doc.sourceDate.toISOString().split('T')[0],
      summary: doc.summary
    }))
  };
}

/**
 * Search for documents that might be unassigned but belong to a specific client
 */
export async function findUnassignedDocumentsForClient(
  firmId: string,
  clientEmailOrDomain: string
) {
  const searchTerm = clientEmailOrDomain.toLowerCase();

  const unassignedDocs = await prisma.document.findMany({
    where: {
      firmId,
      clientId: null,
      OR: [
        { filename: { contains: searchTerm, mode: "insensitive" } },
        { textExcerpt: { contains: searchTerm, mode: "insensitive" } }
      ]
    },
    select: {
      id: true,
      filename: true,
      source: true,
      sourceDate: true,
      textExcerpt: true
    },
    orderBy: { sourceDate: 'desc' },
    take: 10
  });

  return unassignedDocs.map(doc => ({
    filename: doc.filename,
    source: doc.source,
    date: doc.sourceDate.toISOString().split('T')[0],
    excerpt: doc.textExcerpt?.substring(0, 150)
  }));
}