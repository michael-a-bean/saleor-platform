#!/usr/bin/env node
/**
 * Sync Bestsellers Collection
 *
 * This script automatically populates a "bestsellers" collection with
 * top-selling products from Saleor's sales reports.
 *
 * Usage:
 *   node scripts/sync-bestsellers-collection.mjs
 *
 * Environment variables:
 *   SALEOR_API_URL - Saleor GraphQL API URL (default: http://localhost:8000/graphql/)
 *   SALEOR_AUTH_TOKEN - Admin API token with MANAGE_PRODUCTS and MANAGE_DISCOUNTS permissions
 *   BESTSELLERS_COLLECTION_SLUG - Collection slug to update (default: bestsellers)
 *   BESTSELLERS_LIMIT - Number of products to include (default: 50)
 *   REPORTING_PERIOD - Sales period: TODAY or THIS_MONTH (default: THIS_MONTH)
 *   CHANNEL_SLUG - Channel to query sales for (default: webstore)
 */

const SALEOR_API_URL = process.env.SALEOR_API_URL || "http://localhost:8000/graphql/";
const AUTH_TOKEN = process.env.SALEOR_AUTH_TOKEN;
const COLLECTION_SLUG = process.env.BESTSELLERS_COLLECTION_SLUG || "bestsellers";
const LIMIT = parseInt(process.env.BESTSELLERS_LIMIT || "50", 10);
const PERIOD = process.env.REPORTING_PERIOD || "THIS_MONTH";
const CHANNEL = process.env.CHANNEL_SLUG || "webstore";

// GraphQL Queries and Mutations
const REPORT_PRODUCT_SALES = `
  query ReportProductSales($period: ReportingPeriod!, $channel: String!, $first: Int!) {
    reportProductSales(period: $period, channel: $channel, first: $first) {
      edges {
        node {
          id
          quantityOrdered
          product {
            id
            name
            slug
          }
        }
      }
    }
  }
`;

const GET_COLLECTION = `
  query GetCollection($slug: String!, $channel: String!) {
    collection(slug: $slug, channel: $channel) {
      id
      name
      products(first: 100) {
        edges {
          node {
            id
          }
        }
      }
    }
  }
`;

const CREATE_COLLECTION = `
  mutation CreateCollection($input: CollectionCreateInput!) {
    collectionCreate(input: $input) {
      collection {
        id
        name
        slug
      }
      errors {
        field
        message
        code
      }
    }
  }
`;

const COLLECTION_ADD_PRODUCTS = `
  mutation CollectionAddProducts($collectionId: ID!, $productIds: [ID!]!) {
    collectionAddProducts(collectionId: $collectionId, products: $productIds) {
      collection {
        id
        name
        products(first: 10) {
          totalCount
        }
      }
      errors {
        field
        message
        code
      }
    }
  }
`;

const COLLECTION_REMOVE_PRODUCTS = `
  mutation CollectionRemoveProducts($collectionId: ID!, $productIds: [ID!]!) {
    collectionRemoveProducts(collectionId: $collectionId, products: $productIds) {
      collection {
        id
      }
      errors {
        field
        message
        code
      }
    }
  }
`;

const COLLECTION_REORDER_PRODUCTS = `
  mutation CollectionReorderProducts($collectionId: ID!, $moves: [MoveProductInput!]!) {
    collectionReorderProducts(collectionId: $collectionId, moves: $moves) {
      collection {
        id
      }
      errors {
        field
        message
        code
      }
    }
  }
`;

const COLLECTION_CHANNEL_LISTING_UPDATE = `
  mutation CollectionChannelListingUpdate($id: ID!, $input: CollectionChannelListingUpdateInput!) {
    collectionChannelListingUpdate(id: $id, input: $input) {
      collection {
        id
        channelListings {
          channel {
            slug
          }
          isPublished
        }
      }
      errors {
        field
        message
        code
      }
    }
  }
`;

async function graphqlRequest(query, variables = {}) {
  if (!AUTH_TOKEN) {
    throw new Error("SALEOR_AUTH_TOKEN environment variable is required");
  }

  const response = await fetch(SALEOR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await response.json();

  if (json.errors && json.errors.length > 0) {
    throw new Error(`GraphQL errors: ${json.errors.map((e) => e.message).join(", ")}`);
  }

  if (!json.data) {
    throw new Error("No data returned from GraphQL");
  }

  return json.data;
}

async function getTopSellingProducts() {
  console.log(`Fetching top ${LIMIT} selling products for ${PERIOD}...`);

  const data = await graphqlRequest(REPORT_PRODUCT_SALES, {
    period: PERIOD,
    channel: CHANNEL,
    first: LIMIT,
  });

  const products = data.reportProductSales.edges.map((edge) => edge.node);
  console.log(`Found ${products.length} products with sales data`);

  return products;
}

async function getOrCreateCollection() {
  console.log(`Looking for collection "${COLLECTION_SLUG}"...`);

  // Try to get existing collection (without channel filter - admin query)
  const data = await graphqlRequest(`
    query GetCollectionBySlug($slug: String!) {
      collection(slug: $slug) {
        id
        name
        channelListings {
          channel {
            slug
          }
        }
      }
    }
  `, { slug: COLLECTION_SLUG });

  if (data.collection) {
    console.log(`Found existing collection: ${data.collection.name} (${data.collection.id})`);
    // Ensure it has channel listing
    await ensureChannelListing(data.collection.id);
    return data.collection.id;
  }

  // Create new collection
  console.log(`Collection not found, creating "${COLLECTION_SLUG}"...`);

  const createData = await graphqlRequest(CREATE_COLLECTION, {
    input: {
      name: "Bestsellers",
      slug: COLLECTION_SLUG,
      description: JSON.stringify({
        blocks: [
          {
            type: "paragraph",
            data: {
              text: "Our top-selling products, automatically updated based on sales data.",
            },
          },
        ],
      }),
      isPublished: true,
    },
  });

  if (createData.collectionCreate.errors.length > 0) {
    throw new Error(
      `Failed to create collection: ${createData.collectionCreate.errors.map((e) => e.message).join(", ")}`
    );
  }

  if (!createData.collectionCreate.collection) {
    throw new Error("Collection creation returned no collection");
  }

  const collectionId = createData.collectionCreate.collection.id;
  console.log(`Created collection: ${createData.collectionCreate.collection.name}`);

  // Add collection to channel
  console.log(`Adding collection to channel "${CHANNEL}"...`);
  await graphqlRequest(COLLECTION_CHANNEL_LISTING_UPDATE, {
    id: collectionId,
    input: {
      addChannels: [
        {
          channelId: await getChannelId(CHANNEL),
          isPublished: true,
        },
      ],
    },
  });

  return collectionId;
}

async function getChannelId(channelSlug) {
  const data = await graphqlRequest(`
    query GetChannel($slug: String!) {
      channel(slug: $slug) {
        id
      }
    }
  `, { slug: channelSlug });

  if (!data.channel) {
    throw new Error(`Channel "${channelSlug}" not found`);
  }

  return data.channel.id;
}

async function ensureChannelListing(collectionId) {
  // Check current channel listings
  const data = await graphqlRequest(`
    query GetCollectionChannels($id: ID!) {
      collection(id: $id) {
        channelListings {
          channel {
            slug
          }
        }
      }
    }
  `, { id: collectionId });

  const hasChannel = data.collection?.channelListings?.some(
    (listing) => listing.channel.slug === CHANNEL
  );

  if (!hasChannel) {
    console.log(`Adding collection to channel "${CHANNEL}"...`);
    await graphqlRequest(COLLECTION_CHANNEL_LISTING_UPDATE, {
      id: collectionId,
      input: {
        addChannels: [
          {
            channelId: await getChannelId(CHANNEL),
            isPublished: true,
          },
        ],
      },
    });
  }
}

async function getCurrentCollectionProducts(collectionId) {
  const data = await graphqlRequest(GET_COLLECTION, {
    slug: COLLECTION_SLUG,
    channel: CHANNEL,
  });

  if (!data.collection) {
    return [];
  }

  return data.collection.products.edges.map((edge) => edge.node.id);
}

async function syncCollectionProducts(collectionId, topProducts) {
  const newProductIds = topProducts.map((p) => p.product.id);
  const currentProductIds = await getCurrentCollectionProducts(collectionId);

  // Find products to remove (in collection but not in top sellers)
  const toRemove = currentProductIds.filter((id) => !newProductIds.includes(id));

  // Find products to add (in top sellers but not in collection)
  const toAdd = newProductIds.filter((id) => !currentProductIds.includes(id));

  console.log(`Current products: ${currentProductIds.length}`);
  console.log(`New top sellers: ${newProductIds.length}`);
  console.log(`To remove: ${toRemove.length}`);
  console.log(`To add: ${toAdd.length}`);

  // Remove old products
  if (toRemove.length > 0) {
    console.log(`Removing ${toRemove.length} products from collection...`);
    const removeData = await graphqlRequest(COLLECTION_REMOVE_PRODUCTS, {
      collectionId,
      productIds: toRemove,
    });

    if (removeData.collectionRemoveProducts?.errors?.length) {
      console.warn(
        `Warnings removing products: ${removeData.collectionRemoveProducts.errors.map((e) => e.message).join(", ")}`
      );
    }
  }

  // Add new products
  if (toAdd.length > 0) {
    console.log(`Adding ${toAdd.length} products to collection...`);
    const addData = await graphqlRequest(COLLECTION_ADD_PRODUCTS, {
      collectionId,
      productIds: toAdd,
    });

    if (addData.collectionAddProducts?.errors?.length) {
      console.warn(
        `Warnings adding products: ${addData.collectionAddProducts.errors.map((e) => e.message).join(", ")}`
      );
    }
  }

  // Reorder products to match sales ranking
  if (newProductIds.length > 0) {
    console.log("Reordering products by sales rank...");
    const moves = newProductIds.map((productId, index) => ({
      productId,
      sortOrder: index,
    }));

    // Batch reorder in chunks (API may have limits)
    const BATCH_SIZE = 50;
    for (let i = 0; i < moves.length; i += BATCH_SIZE) {
      const batch = moves.slice(i, i + BATCH_SIZE);
      await graphqlRequest(COLLECTION_REORDER_PRODUCTS, {
        collectionId,
        moves: batch,
      });
    }
  }

  console.log("Collection sync complete!");
}

async function main() {
  console.log("=".repeat(60));
  console.log("Bestsellers Collection Sync");
  console.log("=".repeat(60));
  console.log(`API URL: ${SALEOR_API_URL}`);
  console.log(`Collection: ${COLLECTION_SLUG}`);
  console.log(`Channel: ${CHANNEL}`);
  console.log(`Period: ${PERIOD}`);
  console.log(`Limit: ${LIMIT}`);
  console.log("=".repeat(60));

  try {
    // 1. Get top selling products
    const topProducts = await getTopSellingProducts();

    if (topProducts.length === 0) {
      console.log("No sales data found. Nothing to sync.");
      return;
    }

    // Log top 10 for visibility
    console.log("\nTop 10 sellers:");
    topProducts.slice(0, 10).forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.product.name} (${p.quantityOrdered} sold)`);
    });

    // 2. Get or create collection
    const collectionId = await getOrCreateCollection();

    // 3. Sync products to collection
    await syncCollectionProducts(collectionId, topProducts);

    console.log("\nSync completed successfully!");
  } catch (error) {
    console.error("Sync failed:", error.message);
    process.exit(1);
  }
}

main();
