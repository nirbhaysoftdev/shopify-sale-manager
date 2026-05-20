const pool = require("../db/connection");
const shopify = require("../services/shopifyService");
const mysqlSessionStorage = require("../db/sessionStorage");
const { scheduleSaleStart, scheduleSaleEnd } = require("../jobs/scheduler");

const ONE_HOUR_MS = 60 * 60 * 1000;

function toSqlDateTime(d) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

// Expand the campaign window by 1 hour on each side. Two campaigns sharing a
// variant must be at least an hour apart, otherwise the earlier one's restore
// can race the later one's snapshot capture.
function bufferedWindow(start_time, end_time) {
  const start = new Date(start_time);
  const end = end_time ? new Date(end_time) : null;
  return {
    startBuf: toSqlDateTime(new Date(start.getTime() - ONE_HOUR_MS)),
    endBuf: end ? toSqlDateTime(new Date(end.getTime() + ONE_HOUR_MS)) : null,
  };
}

async function getProductId(client, variantId) {
  const query = `
    query {
      productVariant(id: "${variantId}") {
        product { id }
      }
    }
  `;
  const res = await client.request(query);
  return res.data.productVariant.product.id;
}

async function updateVariantPrice(client, variantId, price, compareAtPrice) {
  const productId = await getProductId(client, variantId);

  const mutation = `
    mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
          compareAtPrice
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const res = await client.request(mutation, {
    variables: {
      productId,
      variants: [{
        id: variantId,
        price: price,
        compareAtPrice: compareAtPrice || null
      }]
    }
  });

  const errors = res.data?.productVariantsBulkUpdate?.userErrors;
  if (errors?.length > 0) throw new Error(errors[0].message);
  return res;
}

async function createCampaign(req, res) {
  try {
    const { shop, name, discount_percentage, start_time, end_time, variants } = req.body;

    if (!shop || !name || !start_time || !variants?.length) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // The frontend sends UTC ISO timestamps. Reject anything we can't parse,
    // and reject end <= start so the conflict window can't go negative.
    const startDate = new Date(start_time);
    const endDate = end_time ? new Date(end_time) : null;
    if (Number.isNaN(startDate.getTime())) {
      return res.status(400).json({ error: "Invalid start time" });
    }
    if (endDate && Number.isNaN(endDate.getTime())) {
      return res.status(400).json({ error: "Invalid end time" });
    }
    if (endDate && endDate.getTime() <= startDate.getTime()) {
      return res.status(400).json({ error: "End time must be after start time" });
    }
    const sqlStartTime = toSqlDateTime(startDate);
    const sqlEndTime = endDate ? toSqlDateTime(endDate) : null;

    const sessions = await mysqlSessionStorage.findSessionsByShop(shop);
    if (!sessions || sessions.length === 0) {
      return res.status(401).json({ error: "No session found. Please reinstall the app." });
    }
    const session = sessions[0];

    // Names must be unique per shop so merchants can find a campaign by name.
    // Not race-safe on its own; pair with a DB unique index if you need that.
    const [dupName] = await pool.query(
      `SELECT id FROM campaigns WHERE shop = ? AND name = ? LIMIT 1`,
      [shop, name]
    );
    if (dupName.length > 0) {
      return res.status(409).json({
        error: `A campaign named "${name}" already exists. Choose a different name.`
      });
    }

    // Reject the request if any selected variant is in an overlapping campaign,
    // buffered by 1 hour on both sides so back-to-back campaigns can't clobber
    // each other's price snapshots before the previous one finishes restoring.
    const variantIds = variants.map(v => v.id);
    const { startBuf, endBuf } = bufferedWindow(start_time, end_time);
    const [conflictRows] = await pool.query(
      `SELECT cv.variant_id, c.id AS campaign_id, c.name AS campaign_name,
              c.start_time, c.end_time, c.status
       FROM campaign_variants cv
       JOIN campaigns c ON c.id = cv.campaign_id
       WHERE c.shop = ?
         AND c.status IN ('scheduled', 'active')
         AND cv.variant_id IN (?)
         AND (c.end_time IS NULL OR c.end_time > ?)
         AND (? IS NULL OR c.start_time < ?)`,
      [shop, variantIds, startBuf, endBuf, endBuf]
    );
    if (conflictRows.length > 0) {
      const first = conflictRows[0];
      const endLabel = first.end_time
        ? new Date(first.end_time).toISOString()
        : "no end time";
      return res.status(409).json({
        error: `One or more variants are in another campaign ("${first.campaign_name}", ends ${endLabel}). Campaigns sharing a variant must be at least 1 hour apart — adjust the dates or remove the conflicting variants.`,
        conflicts: conflictRows
      });
    }

    const discountType = req.body.discount_type || "percentage";
    const discountVal = req.body.discount_value || 0;

    const [result] = await pool.query(
      `INSERT INTO campaigns (name, shop, discount_percentage, discount_type, discount_value, status, start_time, end_time)
       VALUES (?, ?, ?, ?, ?, 'scheduled', ?, ?)`,
      [name, shop, discount_percentage, discountType, discountVal, sqlStartTime, sqlEndTime]
    );

    const campaignId = result.insertId;

    for (const variant of variants) {
      await pool.query(
        `INSERT INTO campaign_variants (campaign_id, variant_id, product_id)
         VALUES (?, ?, ?)`,
        [campaignId, variant.id, variant.id]
      );
    }
    // Price snapshots are NOT created here. We defer them to startSale so the
    // "original" reflects Shopify's live state at the moment the sale begins
    // — otherwise a campaign created during another active sale would snapshot
    // an already-discounted price as its base.

    const startDelay = startDate.getTime() - Date.now();

    if (startDelay > 0) {
      await scheduleSaleStart({ campaignId, shop }, startDelay);
      console.log(`✅ Sale start scheduled in ${Math.round(startDelay/1000)}s`);
    } else {
      await startSale(campaignId, shop, session);
    }

    if (endDate) {
      const endDelay = endDate.getTime() - Date.now();
      if (endDelay > 0) {
        await scheduleSaleEnd({ campaignId, shop }, endDelay);
        console.log(`✅ Sale end scheduled in ${Math.round(endDelay/1000)}s`);
      }
    } else {
      console.log(`ℹ️  Campaign ${campaignId} has no end time — runs until ended manually.`);
    }

    res.json({
      campaign: {
        id: campaignId,
        name,
        discount_percentage,
        start_time,
        end_time,
        variantCount: variants.length
      }
    });

  } catch (error) {
    console.error("❌ Create campaign error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

async function fetchVariantLive(client, variantId) {
  const query = `
    query GetVariant($id: ID!) {
      productVariant(id: $id) {
        id
        title
        sku
        price
        compareAtPrice
        product { id title }
      }
    }
  `;
  const res = await client.request(query, { variables: { id: variantId } });
  return res.data?.productVariant || null;
}

async function startSale(campaignId, shop, session) {
  try {
    console.log(`🟢 Starting sale for campaign ${campaignId}`);

    if (!session) {
      const sessions = await mysqlSessionStorage.findSessionsByShop(shop);
      if (!sessions || sessions.length === 0) throw new Error("No session found");
      session = sessions[0];
    }

    const client = new shopify.clients.Graphql({ session });

    const [campaigns] = await pool.query(
      `SELECT discount_type, discount_percentage, discount_value FROM campaigns WHERE id = ?`,
      [campaignId]
    );
    if (campaigns.length === 0) throw new Error("Campaign not found");
    const { discount_type, discount_percentage, discount_value } = campaigns[0];

    // Snapshots may already exist if this campaign was retried — skip re-snapshotting them.
    const [existingSnapshots] = await pool.query(
      `SELECT variant_id FROM price_snapshots WHERE campaign_id = ?`,
      [campaignId]
    );
    const alreadySnapped = new Set(existingSnapshots.map(s => s.variant_id));

    const [variantRows] = await pool.query(
      `SELECT variant_id FROM campaign_variants WHERE campaign_id = ?`,
      [campaignId]
    );

    let updated = 0;
    for (const { variant_id } of variantRows) {
      try {
        const live = await fetchVariantLive(client, variant_id);
        if (!live) {
          console.error(`❌ Variant ${variant_id} not found on Shopify`);
          continue;
        }

        // True original = compareAtPrice if set (variant is currently on sale by another mechanism),
        // otherwise the current price.
        const livePrice = parseFloat(live.price);
        const liveCompare = live.compareAtPrice ? parseFloat(live.compareAtPrice) : null;
        const originalPrice = liveCompare && liveCompare > 0 ? liveCompare : livePrice;

        const salePrice = discount_type === "fixed"
          ? Math.max(0, originalPrice - parseFloat(discount_value))
          : originalPrice - (originalPrice * parseFloat(discount_percentage) / 100);

        if (!alreadySnapped.has(variant_id)) {
          await pool.query(
            `INSERT INTO price_snapshots
             (campaign_id, variant_id, product_title, variant_title, sku, original_price, sale_price, compare_at_price)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              campaignId,
              variant_id,
              live.product?.title || "",
              live.title || "",
              live.sku || "",
              originalPrice,
              salePrice.toFixed(2),
              originalPrice,
            ]
          );
        }

        await updateVariantPrice(
          client,
          variant_id,
          salePrice.toFixed(2),
          originalPrice.toString()
        );
        console.log(`✅ Snapshot+update variant ${variant_id}: £${originalPrice} → £${salePrice.toFixed(2)}`);
        updated++;
      } catch (err) {
        console.error(`❌ Failed to start variant ${variant_id}:`, err.message);
      }
      await new Promise(r => setTimeout(r, 600));
    }

    await pool.query(
      `UPDATE campaigns SET status = 'active' WHERE id = ?`,
      [campaignId]
    );

    console.log(`✅ Sale started for campaign ${campaignId} - ${updated}/${variantRows.length} variants updated`);

  } catch (error) {
    console.error(`❌ Start sale error for campaign ${campaignId}:`, error.message);
  }
}

async function endSale(campaignId, shop) {
  try {
    console.log(`🔴 Ending sale for campaign ${campaignId}`);

    const sessions = await mysqlSessionStorage.findSessionsByShop(shop);
    if (!sessions || sessions.length === 0) {
      console.error("❌ No session found for shop:", shop);
      return;
    }
    const session = sessions[0];
    const client = new shopify.clients.Graphql({ session });

    const [snapshots] = await pool.query(
      `SELECT * FROM price_snapshots WHERE campaign_id = ? AND is_restored = FALSE`,
      [campaignId]
    );

    for (const snapshot of snapshots) {
      try {
        await updateVariantPrice(
          client,
          snapshot.variant_id,
          snapshot.original_price.toString(),
          null
        );
        console.log(`✅ Restored variant to £${snapshot.original_price}`);
      } catch (err) {
        console.error(`❌ Failed to restore variant:`, err.message);
      }

      await pool.query(
        `UPDATE price_snapshots SET is_restored = TRUE WHERE id = ?`,
        [snapshot.id]
      );

      await new Promise(r => setTimeout(r, 600));
    }

    await pool.query(
      `UPDATE campaigns SET status = 'completed' WHERE id = ?`,
      [campaignId]
    );

    console.log(`✅ Sale ended for campaign ${campaignId} - ${snapshots.length} variants restored`);

  } catch (error) {
    console.error(`❌ End sale error for campaign ${campaignId}:`, error.message);
  }
}

const CAMPAIGNS_PAGE_SIZE = 20;

async function getCampaigns(req, res) {
  try {
    const shop = req.query.shop;
    const status = req.query.status || "all";
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const offset = (page - 1) * CAMPAIGNS_PAGE_SIZE;

    if (!shop) return res.status(400).json({ error: "Shop is required" });

    let statusFilter = "";
    if (status === "running") {
      statusFilter = `AND c.status = 'active'`;
    } else if (status === "upcoming") {
      statusFilter = `AND c.status = 'scheduled'`;
    } else if (status === "ended") {
      statusFilter = `AND c.status IN ('completed', 'cancelled')`;
    }

    const [campaigns] = await pool.query(
      `SELECT c.*,
        COUNT(DISTINCT cv.variant_id) as variant_count
       FROM campaigns c
       LEFT JOIN campaign_variants cv ON c.id = cv.campaign_id
       WHERE c.shop = ? ${statusFilter}
       GROUP BY c.id
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
      [shop, CAMPAIGNS_PAGE_SIZE, offset]
    );

    const [counts] = await pool.query(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as running,
        SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as upcoming,
        SUM(CASE WHEN status IN ('completed','cancelled') THEN 1 ELSE 0 END) as ended
       FROM campaigns WHERE shop = ?`,
      [shop]
    );

    const c = counts[0] || {};
    const filterTotal = status === "running" ? Number(c.running || 0)
      : status === "upcoming" ? Number(c.upcoming || 0)
      : status === "ended" ? Number(c.ended || 0)
      : Number(c.total || 0);

    res.json({
      campaigns,
      counts: c,
      page,
      pageSize: CAMPAIGNS_PAGE_SIZE,
      total: filterTotal,
      totalPages: Math.max(1, Math.ceil(filterTotal / CAMPAIGNS_PAGE_SIZE))
    });

  } catch (error) {
    console.error("❌ Get campaigns error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

async function getConflicts(req, res) {
  try {
    const { shop, start, end } = req.query;

    if (!shop) return res.status(400).json({ error: "Shop is required" });
    if (!start) return res.json({ conflicts: [] });

    const newStart = new Date(start);
    if (Number.isNaN(newStart.getTime())) {
      return res.status(400).json({ error: "Invalid start time" });
    }

    if (end) {
      const parsed = new Date(end);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ error: "Invalid end time" });
      }
    }

    // Conflict = an existing scheduled/active campaign whose window, buffered
    // by 1 hour on each side, overlaps [newStart, newEnd]. The 1-hour gap is
    // required so a previous sale's restore can finish before the next snapshot.
    const { startBuf, endBuf } = bufferedWindow(start, end);

    const [rows] = await pool.query(
      `SELECT cv.variant_id, c.id AS campaign_id, c.name AS campaign_name,
              c.start_time, c.end_time, c.status
       FROM campaign_variants cv
       JOIN campaigns c ON c.id = cv.campaign_id
       WHERE c.shop = ?
         AND c.status IN ('scheduled', 'active')
         AND (c.end_time IS NULL OR c.end_time > ?)
         AND (? IS NULL OR c.start_time < ?)`,
      [shop, startBuf, endBuf, endBuf]
    );

    res.json({ conflicts: rows });
  } catch (error) {
    console.error("❌ Get conflicts error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

async function endCampaignNow(req, res) {
  try {
    const campaignId = req.params.id;
    const { shop } = req.body;

    if (!shop) return res.status(400).json({ error: "Shop is required" });

    // Check campaign exists
    const [campaigns] = await pool.query(
      `SELECT * FROM campaigns WHERE id = ? AND shop = ?`,
      [campaignId, shop]
    );

    if (campaigns.length === 0) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const campaign = campaigns[0];

    if (campaign.status === "completed") {
      return res.status(400).json({ error: "Campaign already ended" });
    }

    if (campaign.status === "cancelled") {
      return res.status(400).json({ error: "Campaign already cancelled" });
    }

    // End the sale immediately
    await endSale(parseInt(campaignId), shop);

    res.json({ success: true, message: "Campaign ended successfully" });

  } catch (error) {
    console.error("❌ End campaign now error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

// Returns campaign + per-variant rows (product/variant/sku + original/sale prices).
// Active/completed campaigns read from price_snapshots. Scheduled campaigns
// don't have snapshots yet, so we bulk-fetch the variants from Shopify and
// compute the prospective sale price from the campaign's discount config.
async function getCampaignDetail(req, res) {
  try {
    const shop = req.shop || req.query.shop;
    const campaignId = req.params.id;

    if (!shop) return res.status(400).json({ error: "Shop is required" });

    const [campaigns] = await pool.query(
      `SELECT * FROM campaigns WHERE id = ? AND shop = ?`,
      [campaignId, shop]
    );
    if (campaigns.length === 0) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    const campaign = campaigns[0];

    const [snapshots] = await pool.query(
      `SELECT * FROM price_snapshots WHERE campaign_id = ? ORDER BY product_title, variant_title`,
      [campaignId]
    );

    if (snapshots.length > 0) {
      const items = snapshots.map(s => {
        const original = parseFloat(s.original_price);
        const sale = parseFloat(s.sale_price);
        return {
          variant_id: s.variant_id,
          product_title: s.product_title || "",
          variant_title: s.variant_title || "",
          sku: s.sku || "",
          original_price: original,
          sale_price: sale,
          discount_amount: parseFloat((original - sale).toFixed(2)),
          is_restored: !!s.is_restored,
        };
      });
      return res.json({ campaign, items, source: "snapshot" });
    }

    const [variantRows] = await pool.query(
      `SELECT variant_id FROM campaign_variants WHERE campaign_id = ?`,
      [campaignId]
    );
    if (variantRows.length === 0) {
      return res.json({ campaign, items: [], source: "empty" });
    }

    const session = req.shopifySession
      || (await mysqlSessionStorage.findSessionsByShop(shop))[0];
    if (!session) {
      return res.status(401).json({ error: "No session found" });
    }
    const client = new shopify.clients.Graphql({ session });

    const ids = variantRows.map(v => v.variant_id);
    const query = `
      query GetVariants($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on ProductVariant {
            id
            title
            sku
            price
            compareAtPrice
            product { title }
          }
        }
      }
    `;
    const response = await client.request(query, { variables: { ids } });
    const nodes = (response.data?.nodes || []).filter(Boolean);

    const items = nodes.map(n => {
      const livePrice = parseFloat(n.price);
      const liveCompare = n.compareAtPrice ? parseFloat(n.compareAtPrice) : null;
      const original = liveCompare && liveCompare > 0 ? liveCompare : livePrice;
      const sale = campaign.discount_type === "fixed"
        ? Math.max(0, original - parseFloat(campaign.discount_value))
        : original - (original * parseFloat(campaign.discount_percentage) / 100);
      const saleRounded = parseFloat(sale.toFixed(2));
      return {
        variant_id: n.id,
        product_title: n.product?.title || "",
        variant_title: n.title || "",
        sku: n.sku || "",
        original_price: original,
        sale_price: saleRounded,
        discount_amount: parseFloat((original - saleRounded).toFixed(2)),
        is_restored: false,
      };
    });

    items.sort((a, b) => (a.product_title + a.variant_title).localeCompare(b.product_title + b.variant_title));

    res.json({ campaign, items, source: "live" });
  } catch (error) {
    console.error("❌ Get campaign detail error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

module.exports = { createCampaign, startSale, endSale, getCampaigns, endCampaignNow, getConflicts, getCampaignDetail };