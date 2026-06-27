/**
 * Script to retroactively assign existing documents to clients
 * This will help assign documents that were synced before the automatic client assignment was implemented
 */

import { prisma } from "../lib/prisma";
import { extractAllEmails, findMatchingClientId } from "../lib/email-utils";

async function assignExistingDocuments() {
  console.log("🔄 Starting document assignment process...");

  try {
    // Get all firms (you can filter by specific firmId if needed)
    const firms = await prisma.firm.findMany({
      select: { id: true, name: true }
    });

    for (const firm of firms) {
      console.log(`\n📁 Processing firm: ${firm.name}`);

      // Get all clients with email domains for this firm
      const clients = await prisma.client.findMany({
        where: {
          firmId: firm.id,
          emailDomain: { not: null }
        },
        select: { id: true, name: true, emailDomain: true }
      });

      if (clients.length === 0) {
        console.log("  ⚠️  No clients with email domains found");
        continue;
      }

      console.log(`  👥 Found ${clients.length} clients with email domains:`);
      clients.forEach(client => {
        console.log(`    - ${client.name}: ${client.emailDomain}`);
      });

      // Get all unassigned Gmail documents for this firm
      const unassignedDocs = await prisma.document.findMany({
        where: {
          firmId: firm.id,
          source: "gmail",
          clientId: null
        },
        select: {
          id: true,
          filename: true,
          sourceId: true,
          // We need to fetch the document's metadata if it exists
          // For now, we'll work with what we have
        }
      });

      console.log(`  📄 Found ${unassignedDocs.length} unassigned Gmail documents`);

      let assignedCount = 0;
      let processedCount = 0;

      // For demonstration, let's assign based on filename patterns
      // This is a simplified approach - in real scenario you'd re-fetch Gmail headers
      for (const doc of unassignedDocs) {
        processedCount++;

        try {
          // Simple heuristic: check if filename/subject contains email addresses
          const docText = doc.filename.toLowerCase();

          // Extract any email-like patterns from the subject line
          const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
          const emailsInSubject = docText.match(emailRegex) || [];

          if (emailsInSubject.length > 0) {
            // Find matching client
            const clientId = findMatchingClientId(emailsInSubject, clients);

            if (clientId) {
              await prisma.document.update({
                where: { id: doc.id },
                data: { clientId }
              });

              const client = clients.find(c => c.id === clientId);
              console.log(`    ✅ Assigned "${doc.filename}" to ${client?.name}`);
              assignedCount++;
            }
          }

          // Progress indicator
          if (processedCount % 50 === 0) {
            console.log(`    📊 Progress: ${processedCount}/${unassignedDocs.length} documents processed, ${assignedCount} assigned`);
          }

        } catch (error) {
          console.error(`    ❌ Error processing document ${doc.id}:`, error);
        }
      }

      console.log(`  🎉 Completed: ${assignedCount} out of ${unassignedDocs.length} documents assigned to clients`);
    }

    console.log("\n✅ Document assignment process completed!");

  } catch (error) {
    console.error("❌ Error during document assignment:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
if (require.main === module) {
  assignExistingDocuments();
}

export { assignExistingDocuments };