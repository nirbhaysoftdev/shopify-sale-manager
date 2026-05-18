import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Page, Card, DataTable, TextField, Button,
  Select, Banner, Spinner, Badge, Layout,
  Text, BlockStack, InlineStack, Pagination,
  Thumbnail, Checkbox, RadioButton, Box, Divider,
  EmptyState, InlineGrid, Tooltip
} from "@shopify/polaris";
import { BACKEND_URL, SHOP } from "../App";

export default function CreateCampaignPage() {
  const navigate = useNavigate();

  // Campaign fields
  const [campaignName, setCampaignName] = useState("");
  const [discountType, setDiscountType] = useState("percentage");
  const [discountValue, setDiscountValue] = useState("20");
  const [startTime, setStartTime] = useState("");
  const [hasEndTime, setHasEndTime] = useState(true);
  const [endTime, setEndTime] = useState("");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState(null);

  // Product selection
  const [products, setProducts] = useState([]);
  const [collections, setCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [showDraft, setShowDraft] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pageInfo, setPageInfo] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [cursorStack, setCursorStack] = useState([]);
  const [selectedVariants, setSelectedVariants] = useState([]);

  // variant_id -> { campaign_id, campaign_name, start_time, end_time }
  const [conflicts, setConflicts] = useState({});
  const [conflictsLoading, setConflictsLoading] = useState(false);

  useEffect(() => {
    fetchCollections();
    fetchProducts(null);
  }, []);

  // Re-check conflicts whenever the schedule changes. Debounce so each keystroke
  // in the datetime field doesn't hit the API.
  useEffect(() => {
    if (!startTime || (hasEndTime && !endTime)) {
      setConflicts({});
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setConflictsLoading(true);
      try {
        const params = new URLSearchParams({ shop: SHOP, start: startTime });
        if (hasEndTime && endTime) params.append("end", endTime);
        const res = await fetch(`${BACKEND_URL}/api/campaigns/conflicts?${params}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        const map = {};
        (data.conflicts || []).forEach(c => { map[c.variant_id] = c; });
        setConflicts(map);
      } catch (err) {
        if (err.name !== "AbortError") console.error("Failed to fetch conflicts", err);
      } finally {
        setConflictsLoading(false);
      }
    }, 300);
    return () => { clearTimeout(t); controller.abort(); };
  }, [startTime, endTime, hasEndTime]);

  // Drop any selected variants that became conflicting after a schedule change.
  useEffect(() => {
    setSelectedVariants(prev => {
      const filtered = prev.filter(v => !conflicts[v.id]);
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [conflicts]);

  useEffect(() => {
    setCursor(null);
    setCursorStack([]);
    fetchProducts(null);
  }, [selectedCollection, search, showDraft]);

  async function fetchCollections() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/collections?shop=${SHOP}`);
      const data = await res.json();
      if (data.collections) setCollections(data.collections);
    } catch (err) {
      console.error("Failed to fetch collections", err);
    }
  }

  async function fetchProducts(cur = null) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ shop: SHOP });
      if (cur) params.append("cursor", cur);
      if (search) params.append("search", search);
      if (showDraft) params.append("showDraft", "true");

      let url;
      if (selectedCollection === "all") {
        url = `${BACKEND_URL}/api/products?${params}`;
      } else {
        url = `${BACKEND_URL}/api/collections/${encodeURIComponent(selectedCollection)}/products?${params}`;
      }

      const res = await fetch(url);
      const data = await res.json();
      if (data.products) {
        setProducts(data.products);
        setPageInfo(data.pageInfo);
      }
    } catch (err) {
      console.error("Failed to fetch products", err);
    } finally {
      setLoading(false);
    }
  }

  function calculateSalePrice(price) {
    const original = parseFloat(price);
    if (discountType === "percentage") {
      return (original - (original * parseFloat(discountValue) / 100)).toFixed(2);
    } else {
      return Math.max(0, original - parseFloat(discountValue)).toFixed(2);
    }
  }

  function toggleVariant(variantId, productTitle, variantTitle, price) {
    if (conflicts[variantId]) return;
    setSelectedVariants(prev => {
      const exists = prev.find(v => v.id === variantId);
      if (exists) return prev.filter(v => v.id !== variantId);
      return [...prev, { id: variantId, productTitle, variantTitle, price }];
    });
  }

  function selectAllOnPage() {
    const pageVariants = products.flatMap(p =>
      p.variants
        .filter(v => !conflicts[v.id])
        .map(v => ({
          id: v.id,
          productTitle: p.title,
          variantTitle: v.title,
          price: v.price
        }))
    );
    setSelectedVariants(prev => {
      const existingIds = prev.map(v => v.id);
      const newVariants = pageVariants.filter(v => !existingIds.includes(v.id));
      return [...prev, ...newVariants];
    });
  }

  function handleCreate() {
    if (!campaignName) return setMessage({ type: "critical", text: "Please enter a campaign name" });
    if (!discountValue || parseFloat(discountValue) <= 0) return setMessage({ type: "critical", text: "Please enter a valid discount value" });
    if (selectedVariants.length === 0) return setMessage({ type: "critical", text: "Please select at least one variant" });
    if (!startTime) return setMessage({ type: "critical", text: "Please set a start time" });
    if (hasEndTime && !endTime) return setMessage({ type: "critical", text: "Please set an end time" });

    setCreating(true);

    const body = {
      shop: SHOP,
      name: campaignName,
      discount_type: discountType,
      discount_percentage: discountType === "percentage" ? parseFloat(discountValue) : 0,
      discount_value: discountType === "fixed" ? parseFloat(discountValue) : 0,
      start_time: startTime,
      end_time: hasEndTime ? endTime : null,
      variants: selectedVariants
    };

    // Fire-and-forget: the server response is delivered to the campaigns page
    // through sessionStorage + a window event. The user moves on immediately.
    fetch(`${BACKEND_URL}/api/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        const toast = (res.ok && data.campaign)
          ? { type: "success", text: `Campaign "${campaignName}" created.` }
          : { type: "critical", text: data.error || "Failed to create campaign" };
        sessionStorage.setItem("campaign-toast", JSON.stringify(toast));
        window.dispatchEvent(new Event("campaign:create-resolved"));
      })
      .catch(() => {
        sessionStorage.setItem("campaign-toast", JSON.stringify({
          type: "critical",
          text: "Failed to create campaign"
        }));
        window.dispatchEvent(new Event("campaign:create-resolved"));
      });

    navigate("/campaigns", { state: { pendingCreate: { name: campaignName } } });
  }

  const collectionOptions = [
    { label: "All products", value: "all" },
    ...collections.map(c => ({ label: `${c.title} (${c.productsCount})`, value: c.id }))
  ];

  const summary = useMemo(() => {
    const original = selectedVariants.reduce((s, v) => s + (parseFloat(v.price) || 0), 0);
    const sale = selectedVariants.reduce((s, v) => s + parseFloat(calculateSalePrice(v.price)), 0);
    return {
      originalTotal: original.toFixed(2),
      saleTotal: sale.toFixed(2),
      savings: (original - sale).toFixed(2)
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVariants, discountType, discountValue]);

  const formatScheduleLabel = (value) => {
    if (!value) return <Text tone="subdued">—</Text>;
    const d = new Date(value);
    return (
      <Text variant="bodyMd">
        {d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}{" · "}
        {d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
      </Text>
    );
  };

  const conflictCountOnPage = products.reduce(
    (n, p) => n + p.variants.filter(v => conflicts[v.id]).length,
    0
  );

  const rows = products.flatMap(product =>
    product.variants.map(variant => {
      const isSelected = !!selectedVariants.find(v => v.id === variant.id);
      const conflict = conflicts[variant.id];
      const dim = (node) =>
        conflict ? <div style={{ opacity: 0.45 }}>{node}</div> : node;
      const conflictLabel = conflict
        ? `Booked in “${conflict.campaign_name}” (${new Date(conflict.start_time).toLocaleDateString("en-GB")}${conflict.end_time ? ` – ${new Date(conflict.end_time).toLocaleDateString("en-GB")}` : " – no end"})`
        : null;

      return [
        conflict ? (
          <Tooltip content={conflictLabel}>
            <input
              type="checkbox"
              checked={false}
              disabled
              readOnly
              style={{ cursor: "not-allowed", width: "16px", height: "16px" }}
            />
          </Tooltip>
        ) : (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleVariant(variant.id, product.title, variant.title, variant.price)}
            style={{ cursor: "pointer", width: "16px", height: "16px", accentColor: "#005bd3" }}
          />
        ),
        dim(
          <InlineStack gap="300" blockAlign="center" wrap={false}>
            {product.image ? (
              <Thumbnail source={product.image} alt={product.title} size="small" />
            ) : (
              <Box
                background="bg-surface-secondary"
                borderRadius="200"
                minWidth="40px"
                minHeight="40px"
              />
            )}
            <BlockStack gap="050">
              <Text variant="bodyMd" fontWeight="semibold">{product.title}</Text>
              <InlineStack gap="100">
                <Badge tone={product.status === "ACTIVE" ? "success" : "info"} size="small">
                  {product.status === "ACTIVE" ? "Active" : "Draft"}
                </Badge>
                {conflict && (
                  <Tooltip content={conflictLabel}>
                    <Badge tone="warning" size="small">In another campaign</Badge>
                  </Tooltip>
                )}
              </InlineStack>
            </BlockStack>
          </InlineStack>
        ),
        dim(
          <Text variant="bodyMd" tone={variant.title === "Default Title" ? "subdued" : undefined}>
            {variant.title === "Default Title" ? "—" : variant.title}
          </Text>
        ),
        dim(<Text variant="bodySm" tone="subdued">{variant.sku || "—"}</Text>),
        dim(<Text variant="bodyMd">£{variant.price}</Text>),
        dim(
          isSelected
            ? (
              <BlockStack gap="050">
                <Text variant="bodyMd" tone="success" fontWeight="semibold">£{calculateSalePrice(variant.price)}</Text>
                <Text variant="bodySm" tone="subdued">
                  <span style={{ textDecoration: "line-through" }}>£{variant.price}</span>
                </Text>
              </BlockStack>
            )
            : <Text tone="subdued">—</Text>
        )
      ];
    })
  );

  return (
    <Page
      title="Create campaign"
      subtitle="Set a discount, choose products, and schedule when the sale starts and ends."
      backAction={{ content: "Campaigns", onAction: () => navigate("/campaigns") }}
    >
      {message && (
        <Box paddingBlockEnd="400">
          <Banner tone={message.type} onDismiss={() => setMessage(null)}>
            {message.text}
          </Banner>
        </Box>
      )}

      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            <Card>
              <BlockStack gap="400">
                <SectionHeader step="01" title="Campaign details" hint="A clear, descriptive name helps you find this sale later." />
                <TextField
                  label="Campaign name"
                  value={campaignName}
                  onChange={setCampaignName}
                  placeholder="e.g. Summer Sale 2026"
                  autoComplete="off"
                />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <SectionHeader step="02" title="Discount" hint="How much should each selected variant come down by?" />
                <InlineStack gap="500" wrap>
                  <RadioButton
                    label="Percentage off"
                    helpText="e.g. 20% off"
                    checked={discountType === "percentage"}
                    onChange={() => setDiscountType("percentage")}
                  />
                  <RadioButton
                    label="Fixed amount off"
                    helpText="e.g. £10 off"
                    checked={discountType === "fixed"}
                    onChange={() => setDiscountType("fixed")}
                  />
                </InlineStack>
                <Box maxWidth="240px">
                  <TextField
                    label={discountType === "percentage" ? "Discount percentage" : "Discount amount"}
                    value={discountValue}
                    onChange={setDiscountValue}
                    type="number"
                    min="0"
                    prefix={discountType === "fixed" ? "£" : undefined}
                    suffix={discountType === "percentage" ? "%" : undefined}
                    autoComplete="off"
                  />
                </Box>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <SectionHeader step="03" title="Schedule" hint="Sales start and end automatically based on your store's timezone." />
                <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                  <TextField
                    label="Starts at"
                    value={startTime}
                    onChange={setStartTime}
                    type="datetime-local"
                    autoComplete="off"
                  />
                  <BlockStack gap="200">
                    <Checkbox
                      label="Set an end time"
                      checked={hasEndTime}
                      onChange={setHasEndTime}
                      helpText="If unchecked, the sale runs until you end it manually."
                    />
                    {hasEndTime && (
                      <TextField
                        label="Ends at"
                        value={endTime}
                        onChange={setEndTime}
                        type="datetime-local"
                        autoComplete="off"
                      />
                    )}
                  </BlockStack>
                </InlineGrid>
              </BlockStack>
            </Card>

          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <div style={{ position: "sticky", top: "16px" }}>
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued" fontWeight="medium">SUMMARY</Text>
                    <Text variant="headingLg" as="h2">
                      {campaignName || "Untitled campaign"}
                    </Text>
                  </BlockStack>

                  <Divider />

                  <BlockStack gap="300">
                    <SummaryRow
                      label="Discount"
                      value={
                        discountValue && parseFloat(discountValue) > 0
                          ? (discountType === "percentage" ? `${discountValue}% off` : `£${discountValue} off`)
                          : <Text tone="subdued">Not set</Text>
                      }
                    />
                    <SummaryRow
                      label="Variants selected"
                      value={
                        <Badge tone={selectedVariants.length > 0 ? "success" : "attention"}>
                          {`${selectedVariants.length}`}
                        </Badge>
                      }
                    />
                    <SummaryRow label="Starts" value={formatScheduleLabel(startTime)} />
                    <SummaryRow label="Ends" value={hasEndTime ? formatScheduleLabel(endTime) : <Text tone="subdued">No end time</Text>} />
                  </BlockStack>

                  {selectedVariants.length > 0 && (
                    <>
                      <Divider />
                      <BlockStack gap="200">
                        <Text variant="bodySm" tone="subdued" fontWeight="medium">
                          PRICE IMPACT (SELECTED)
                        </Text>
                        <SummaryRow label="Total original" value={`£${summary.originalTotal}`} />
                        <SummaryRow label="Total sale" value={<Text tone="success" fontWeight="semibold">£{summary.saleTotal}</Text>} />
                        <SummaryRow label="Customer savings" value={<Text fontWeight="semibold">£{summary.savings}</Text>} />
                      </BlockStack>
                    </>
                  )}

                  <Divider />

                  <BlockStack gap="200">
                    <Button
                      variant="primary"
                      tone="success"
                      fullWidth
                      onClick={handleCreate}
                      loading={creating}
                      disabled={selectedVariants.length === 0}
                    >
                      {selectedVariants.length === 0
                        ? "Select variants to continue"
                        : `Create campaign (${selectedVariants.length})`}
                    </Button>
                    {selectedVariants.length > 0 && (
                      <Button fullWidth variant="tertiary" onClick={() => setSelectedVariants([])}>
                        Clear selection
                      </Button>
                    )}
                  </BlockStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <Text variant="headingSm">Tips</Text>
                  <Text tone="subdued" variant="bodySm">
                    • Original prices are saved before the sale starts and restored automatically when it ends.
                  </Text>
                  <Text tone="subdued" variant="bodySm">
                    • You can end a running campaign early at any time from the campaigns page.
                  </Text>
                </BlockStack>
              </Card>
            </BlockStack>
          </div>
        </Layout.Section>
      </Layout>

      <Box paddingBlockStart="500" />

      <Card padding="0">
        <Box padding="400">
          <SectionHeader
            step="04"
            title="Products and variants"
            hint="Pick which variants this discount applies to. Pricing previews update live."
          />
        </Box>
        <Divider />
        <Box padding="400">
          <BlockStack gap="400">
            {(!startTime || (hasEndTime && !endTime)) && (
              <Banner tone="info">
                Set a start{hasEndTime ? " and end" : ""} time above to check for conflicts with other campaigns.
              </Banner>
            )}

            {conflictsLoading && (
              <InlineStack gap="200" blockAlign="center">
                <Spinner size="small" />
                <Text tone="subdued" variant="bodySm">Checking for conflicts…</Text>
              </InlineStack>
            )}

            {!conflictsLoading && conflictCountOnPage > 0 && (
              <Banner tone="warning">
                {conflictCountOnPage} variant{conflictCountOnPage === 1 ? " is" : "s are"} unavailable on this page because they already belong to a campaign whose dates overlap with yours. Adjust your start or end time to free them up.
              </Banner>
            )}

            <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
              <Select
                label="Filter by collection"
                options={collectionOptions}
                value={selectedCollection}
                onChange={val => {
                  setSelectedCollection(val);
                  setCursor(null);
                  setCursorStack([]);
                }}
              />
              <TextField
                label="Search products"
                value={searchInput}
                onChange={setSearchInput}
                placeholder="Search by product name…"
                autoComplete="off"
                connectedRight={
                  <Button onClick={() => setSearch(searchInput)}>Search</Button>
                }
              />
            </InlineGrid>

            <InlineStack gap="400" align="space-between" blockAlign="center" wrap>
              <Checkbox
                label="Show active products only"
                checked={!showDraft}
                onChange={(val) => setShowDraft(!val)}
              />
              <InlineStack gap="200">
                {search && (
                  <Button size="slim" onClick={() => { setSearch(""); setSearchInput(""); }}>
                    Clear search
                  </Button>
                )}
                <Button size="slim" onClick={selectAllOnPage}>
                  Select all on this page
                </Button>
              </InlineStack>
            </InlineStack>

            {loading ? (
              <Box padding="1600">
                <BlockStack gap="200" align="center" inlineAlign="center">
                  <Spinner />
                  <Text tone="subdued">Loading products…</Text>
                </BlockStack>
              </Box>
            ) : rows.length === 0 ? (
              <EmptyState
                heading="No products to show"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Try a different collection, clear the search, or include draft products.</p>
              </EmptyState>
            ) : (
              <BlockStack gap="300">
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text", "text"]}
                  headings={[
                    "",
                    "Product",
                    "Variant",
                    "SKU",
                    "Original",
                    discountType === "percentage"
                      ? `Sale (${discountValue || 0}% off)`
                      : `Sale (£${discountValue || 0} off)`
                  ]}
                  rows={rows}
                  increasedTableDensity
                />
                <InlineStack align="center">
                  <Pagination
                    hasPrevious={cursorStack.length > 0}
                    onPrevious={() => {
                      const newStack = [...cursorStack];
                      const prev = newStack.pop();
                      setCursorStack(newStack);
                      setCursor(prev);
                      fetchProducts(prev);
                    }}
                    hasNext={pageInfo?.hasNextPage}
                    onNext={() => {
                      setCursorStack(prev => [...prev, cursor]);
                      setCursor(pageInfo.endCursor);
                      fetchProducts(pageInfo.endCursor);
                    }}
                  />
                </InlineStack>
              </BlockStack>
            )}
          </BlockStack>
        </Box>
      </Card>

      <Box paddingBlockStart="800" />
    </Page>
  );
}

function SectionHeader({ step, title, hint }) {
  return (
    <BlockStack gap="100">
      <InlineStack gap="200" blockAlign="center">
        <Box
          background="bg-surface-secondary"
          borderRadius="full"
          paddingInline="200"
          paddingBlock="050"
          minWidth="32px"
        >
          <Text variant="bodySm" tone="subdued" fontWeight="medium" alignment="center">{step}</Text>
        </Box>
        <Text variant="headingMd" as="h2">{title}</Text>
      </InlineStack>
      {hint && <Text variant="bodySm" tone="subdued">{hint}</Text>}
    </BlockStack>
  );
}

function SummaryRow({ label, value }) {
  return (
    <InlineStack align="space-between" blockAlign="center">
      <Text variant="bodyMd" tone="subdued">{label}</Text>
      <div style={{ textAlign: "right" }}>
        {typeof value === "string" || typeof value === "number"
          ? <Text variant="bodyMd" fontWeight="medium">{value}</Text>
          : value}
      </div>
    </InlineStack>
  );
}
