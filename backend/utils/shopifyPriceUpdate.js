async function updateVariantPrice(client, variantId, price, compareAtPrice) {
  // Extract numeric ID from GID
  const numericId = variantId.replace("gid://shopify/ProductVariant/", "");

  const mutation = `
    mutation variantUpdate($input: ProductVariantInput!) {
      productVariantUpdate(input: $input) {
        productVariant {
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

  try {
    const response = await client.request(mutation, {
      variables: {
        input: {
          id: variantId,
          price: price,
          compareAtPrice: compareAtPrice || null
        }
      }
    });

    const errors = response.data?.productVariantUpdate?.userErrors;
    if (errors?.length > 0) {
      throw new Error(errors[0].message);
    }

    return response;
  } catch (err) {
    // Fallback to REST API
    throw err;
  }
}

module.exports = { updateVariantPrice };
