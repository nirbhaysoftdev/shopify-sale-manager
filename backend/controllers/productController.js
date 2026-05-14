const shopify = require("../services/shopifyService");
const mysqlSessionStorage = require("../db/sessionStorage");

async function getProducts(req, res) {
  try {
    const shop = req.query.shop;
    const cursor = req.query.cursor || null;
    const search = req.query.search || "";
    const showDraft = req.query.showDraft === "true";
    console.log("🔍 showDraft:", showDraft, "queryString:", !showDraft ? "status:active" : "no filter");
    const tag = req.query.tag || "";

    if (!shop) return res.status(400).json({ error: "Shop is required" });

    const sessions = await mysqlSessionStorage.findSessionsByShop(shop);
    if (!sessions || sessions.length === 0) {
      return res.status(401).json({ error: "No session found. Please reinstall the app." });
    }

    const session = sessions[0];
    const client = new shopify.clients.Graphql({ session });

    // Build search query string
    let queryParts = [];
    if (!showDraft) queryParts.push("status:ACTIVE");
    if (search) queryParts.push(`title:*${search}*`);
    if (tag) queryParts.push(`tag:'${tag}'`);
    const queryString = queryParts.join(" AND ");

    const query = `
      query getProducts($cursor: String, $queryString: String) {
        products(first: 20, after: $cursor, query: $queryString) {
          pageInfo {
            hasNextPage
            hasPreviousPage
            endCursor
            startCursor
          }
          edges {
            node {
              id
              title
              status
              tags
              images(first: 1) {
                edges {
                  node { url }
                }
              }
              variants(first: 100) {
                edges {
                  node {
                    id
                    title
                    sku
                    price
                    compareAtPrice
                    inventoryQuantity
                  }
                }
              }
            }
          }
        }
      }
    `;

    const response = await client.request(query, {
      variables: {
        cursor,
        queryString: queryString || null
      }
    });

    const products = response.data.products.edges.map(edge => ({
      id: edge.node.id,
      title: edge.node.title,
      status: edge.node.status,
      tags: edge.node.tags,
      image: edge.node.images.edges[0]?.node?.url || null,
      variants: edge.node.variants.edges.map(v => ({
        id: v.node.id,
        title: v.node.title,
        sku: v.node.sku,
        price: v.node.price,
        compareAtPrice: v.node.compareAtPrice,
        inventoryQuantity: v.node.inventoryQuantity
      }))
    }));

    res.json({
      products,
      pageInfo: response.data.products.pageInfo
    });

  } catch (error) {
    console.error("❌ Get products error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

module.exports = { getProducts };