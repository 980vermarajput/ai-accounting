/**
 * Generates firm knowledge snapshots that provide AI context about:
 * - Client count and status
 * - Document assignment statistics
 * - Overall firm metrics
 * - Unassigned document analysis
 */

import { prisma } from "./prisma";

interface FirmSnapshot {
  firmInfo: {
    name: string;
    totalClients: number;
    totalDocuments: number;
    documentsAssigned: number;
    documentsUnassigned: number;
  };
  clientBreakdown: Array<{
    name: string;
    emailDomain?: string;
    documentCount: number;
    lastCommunication?: string;
  }>;
  documentSummary: {
    bySource: Record<string, number>;
    byStatus: Record<string, number>;
    recentActivity: Array<{
      filename: string;
      source: string;
      date: string;
      client?: string;
    }>;
  };
  unassignedDocuments: {
    count: number;
    samples: Array<{
      filename: string;
      source: string;
      date: string;
      excerpt?: string;
    }>;
  };
}

/**
 * Generate a comprehensive firm knowledge snapshot for AI context
 */
export async function generateFirmSnapshot(firmId: string): Promise<string> {
  try {
    // Get firm info
    const firm = await prisma.firm.findUnique({
      where: { id: firmId },
      select: { name: true }
    });

    if (!firm) {
      throw new Error("Firm not found");
    }

    // Get client statistics
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

    // Get client breakdown
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
      },
      take: 10 // Top 10 clients by document count
    });

    // Get last communication per client
    const clientsWithLastComm = await Promise.all(
      clients.map(async (client) => {
        const lastDoc = await prisma.document.findFirst({
          where: {
            firmId,
            // We need to find this client's ID first
            clientId: (await prisma.client.findFirst({
              where: { firmId, name: client.name },
              select: { id: true }
            }))?.id
          },
          orderBy: { sourceDate: 'desc' },
          select: { sourceDate: true }
        });

        return {
          name: client.name,
          emailDomain: client.emailDomain || undefined,
          documentCount: client._count.documents,
          lastCommunication: lastDoc?.sourceDate.toISOString()
        };
      })
    );

    // Get document statistics by source and status
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

    // Get recent activity (last 10 documents)
    const recentDocs = await prisma.document.findMany({
      where: { firmId },
      orderBy: { sourceDate: 'desc' },
      take: 10,
      select: {
        filename: true,
        source: true,
        sourceDate: true,
        client: {
          select: { name: true }
        }
      }
    });

    // Get unassigned documents sample
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

    const snapshot: FirmSnapshot = {
      firmInfo: {
        name: firm.name,
        totalClients,
        totalDocuments,
        documentsAssigned,
        documentsUnassigned
      },
      clientBreakdown: clientsWithLastComm,
      documentSummary: {
        bySource: sourceStats.reduce((acc, stat) => {
          acc[stat.source] = stat._count.source;
          return acc;
        }, {} as Record<string, number>),
        byStatus: statusStats.reduce((acc, stat) => {
          acc[stat.status] = stat._count.status;
          return acc;
        }, {} as Record<string, number>),
        recentActivity: recentDocs.map(doc => ({
          filename: doc.filename,
          source: doc.source,
          date: doc.sourceDate.toISOString().split('T')[0],
          client: doc.client?.name
        }))
      },
      unassignedDocuments: {
        count: documentsUnassigned,
        samples: unassignedSample.map(doc => ({
          filename: doc.filename,
          source: doc.source,
          date: doc.sourceDate.toISOString().split('T')[0],
          excerpt: doc.textExcerpt?.substring(0, 100)
        }))
      }
    };

    return formatSnapshotForAI(snapshot);

  } catch (error) {
    console.error("Error generating firm snapshot:", error);
    return "Firm overview data temporarily unavailable.";
  }
}

/**
 * Format the snapshot data into a human-readable format for AI context
 */
function formatSnapshotForAI(snapshot: FirmSnapshot): string {
  const { firmInfo, clientBreakdown, documentSummary, unassignedDocuments } = snapshot;

  return `FIRM OVERVIEW FOR ${firmInfo.name.toUpperCase()}

📊 FIRM STATISTICS:
• Total Clients: ${firmInfo.totalClients}
• Total Documents: ${firmInfo.totalDocuments}
• Documents Assigned to Clients: ${firmInfo.documentsAssigned}
• Unassigned Documents: ${firmInfo.documentsUnassigned}
• Assignment Rate: ${Math.round((firmInfo.documentsAssigned / firmInfo.totalDocuments) * 100)}%

👥 CLIENT BREAKDOWN (Top clients by document volume):
${clientBreakdown.map(client =>
  `• ${client.name}: ${client.documentCount} docs ${client.emailDomain ? `(${client.emailDomain})` : ''} ${client.lastCommunication ? `- Last: ${client.lastCommunication.split('T')[0]}` : ''}`
).join('\n')}

📄 DOCUMENT DISTRIBUTION:
Sources: ${Object.entries(documentSummary.bySource).map(([source, count]) => `${source}: ${count}`).join(', ')}
Status: ${Object.entries(documentSummary.byStatus).map(([status, count]) => `${status}: ${count}`).join(', ')}

📅 RECENT ACTIVITY (Last 10 documents):
${documentSummary.recentActivity.map(doc =>
  `• ${doc.date} - ${doc.filename} [${doc.source}]${doc.client ? ` → ${doc.client}` : ' → Unassigned'}`
).join('\n')}

⚠️  UNASSIGNED DOCUMENTS (${unassignedDocuments.count} total):
${unassignedDocuments.samples.map(doc =>
  `• ${doc.date} - ${doc.filename} [${doc.source}]${doc.excerpt ? ` - "${doc.excerpt}..."` : ''}`
).join('\n')}

📝 ANALYSIS CAPABILITIES:
You can answer questions about:
- Individual client document analysis and financial status
- Firm-wide statistics and trends
- Unassigned document analysis and potential client matching
- Cross-client comparisons and insights
- Document processing status and workflow issues`;
}

/**
 * Update the firm's knowledge snapshot in the database
 */
export async function updateFirmSnapshot(firmId: string): Promise<void> {
  const snapshot = await generateFirmSnapshot(firmId);

  await prisma.firm.update({
    where: { id: firmId },
    data: { knowledgeSnapshot: snapshot }
  });
}