const shopify = require("../services/shopifyService");
const mysqlSessionStorage = require("../db/sessionStorage");

async function getCollections(req, res) {
  try {
    const shop = req.query.shop;
    if (!shop) return res.status(400).json({ error: "Shop is required" });

    const sessions = await mysqlSessionStorage.findSessionsByShop(shop);
    if (!sessions || sessions.length === 0) {
      return res.status(401).json({ error: "No session found. Please reinstall the app." });
    }

    const session = sessions[0];
    const client = new shopify.clients.Graphql({ session });

    const query = `
      query {
        collections(first: 100) {
          edges {
            node {
              id
              title
              productsCount {
                count
              }
            }
          }
        }
      }
    `;

    const response = await client.request(query);
    const collections = response.data.collections.edges.map(edge => ({
      id: edge.node.id,
      title: edge.node.title,
      productsCount: edge.node.productsCount?.count || 0
    }));

    res.json({ collections });

  } catch (error) {
    console.error("❌ Get collections error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

async function getCollectionProducts(req, res) {
  try {
    const shop = req.query.shop;
    const collectionId = decodeURIComponent(req.params.id);
    const cursor = req.query.cursor || null;
    const search = req.query.search || "";

    if (!shop) return res.status(400).json({ error: "Shop is required" });

    const sessions = await mysqlSessionStorage.findSessionsByShop(shop);
    if (!sessions || sessions.length === 0) {
      return res.status(401).json({ error: "No session found." });
    }

    const session = sessions[0];
    const client = new shopify.clients.Graphql({ session });

    const query = `
      query getCollectionProducts($id: ID!, $cursor: String) {
        collection(id: $id) {
          title
          products(first: 20, after: $cursor) {
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
                images(first: 1) {
                  edges {
                    node {
                      url
                    }
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
      }
    `;

    const response = await client.request(query, {
      variables: { id: collectionId, cursor }
    });

    const collection = response.data.collection;
    const products = collection.products.edges.map(edge => ({
      id: edge.node.id,
      title: edge.node.title,
      status: edge.node.status,
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

    const filtered = search
      ? products.filter(p => p.title.toLowerCase().includes(search.toLowerCase()))
      : products;

    res.json({
      products: filtered,
      pageInfo: collection.products.pageInfo,
      collectionTitle: collection.title
    });

  } catch (error) {
    console.error("❌ Get collection products error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

module.exports = { getCollections, getCollectionProducts };
