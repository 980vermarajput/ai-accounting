/**
 * Simple script to assign documents containing specific email addresses to clients
 */

import { prisma } from "../lib/prisma";

async function simpleAssignment() {
  try {
    console.log("🔍 Looking for clients and unassigned documents...");

    // Find the client with email domain 980vermarajput@gmail.com
    const client = await prisma.client.findFirst({
      where: {
        emailDomain: "980vermarajput@gmail.com"
      },
      select: {
        id: true,
        name: true,
        emailDomain: true,
        firmId: true
      }
    });

    if (!client) {
      console.log("❌ Client with email domain '980vermarajput@gmail.com' not found");
      return;
    }

    console.log(`✅ Found client: ${client.name} (${client.emailDomain})`);

    // Count total documents for this firm
    const totalDocs = await prisma.document.count({
      where: { firmId: client.firmId }
    });

    // Count unassigned documents
    const unassignedDocs = await prisma.document.count({
      where: {
        firmId: client.firmId,
        clientId: null
      }
    });

    // Count documents already assigned to this client
    const assignedToClient = await prisma.document.count({
      where: {
        firmId: client.firmId,
        clientId: client.id
      }
    });

    console.log(`📊 Document stats for firm:`);
    console.log(`  Total documents: ${totalDocs}`);
    console.log(`  Unassigned: ${unassignedDocs}`);
    console.log(`  Assigned to ${client.name}: ${assignedToClient}`);

    // For demonstration, let's look at some unassigned documents
    const sampleDocs = await prisma.document.findMany({
      where: {
        firmId: client.firmId,
        clientId: null
      },
      select: {
        id: true,
        filename: true,
        source: true,
        sourceDate: true
      },
      take: 10,
      orderBy: {
        sourceDate: 'desc'
      }
    });

    console.log(`\n📄 Sample unassigned documents:`);
    sampleDocs.forEach((doc, i) => {
      console.log(`  ${i + 1}. [${doc.source}] ${doc.filename} (${doc.sourceDate.toLocaleDateString()})`);
    });

    // Simple assignment: assign documents that contain the email in filename
    const updateResult = await prisma.document.updateMany({
      where: {
        firmId: client.firmId,
        clientId: null,
        OR: [
          { filename: { contains: "980vermarajput@gmail.com", mode: "insensitive" } },
          { filename: { contains: "980vermarajput", mode: "insensitive" } },
          { textExcerpt: { contains: "980vermarajput@gmail.com", mode: "insensitive" } },
        ]
      },
      data: {
        clientId: client.id
      }
    });

    console.log(`\n🎉 Assigned ${updateResult.count} documents to ${client.name}!`);

    // Show updated count
    const newAssignedCount = await prisma.document.count({
      where: {
        firmId: client.firmId,
        clientId: client.id
      }
    });

    console.log(`✅ Total documents now assigned to ${client.name}: ${newAssignedCount}`);

  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  simpleAssignment();
}

export { simpleAssignment };