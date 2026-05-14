import { prisma } from '../src/lib/prisma';

async function main() {
  const connectionId = 'cmp0yyllz0004v0dg1bxzmdds';
  
  const mockLayoutMeta = {
    "SLS_Web": {
      "name": "SLS_Web",
      "fields": [
        "OrderID",
        "UssmID",
        "OrderEnteredDate",
        "SaleAmount",
        "SalesStatus"
      ],
      "portals": []
    },
    "CMT_Web": {
      "name": "CMT_Web",
      "fields": [
        "USSMID",
        "ContactName",
        "ContactType",
        "ContactID",
        "ValidUser"
      ],
      "portals": []
    },
    "LIC_Web": {
      "name": "LIC_Web",
      "fields": [
        "LicenseID",
        "UssmID",
        "LicenseType",
        "ExpirationDate"
      ],
      "portals": []
    }
  };

  const selectedLayouts = ["SLS_Web", "CMT_Web", "LIC_Web"];

  await prisma.browsedSchema.update({
    where: { connectionId },
    data: {
      rawLayoutMeta: JSON.stringify(mockLayoutMeta),
      selectedLayouts: JSON.stringify(selectedLayouts),
      compiledSchema: JSON.stringify({ layouts: selectedLayouts }) // basic compiled schema
    }
  });

  console.log('Successfully populated mock schema metadata.');
}

main().catch(console.error);
