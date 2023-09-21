const axios = require("axios");
const utils = require("./utils");
const { parseUnitSize, units } = require("./ah");

exports.urlBase = "https://www.jumbo.com/producten/";

exports.getCanonical = (item, today) => {
    const price = (item.prices.promoPrice || item.prices.price) / 100;

    const parsedSize = parseUnitSize(item.packSizeDisplay);
    if (!parsedSize) {
        console.log(`Failed to parse unit size '${item.packSizeDisplay}' in item ${item.title}`);
    }

    return utils.convertUnit(
        {
            id: item.sku,
            name: item.title,
            // isWeighted,
            price,
            priceHistory: [{ date: today, price }],
            // bio,
            url: item.link.replace(/^\/producten\//, ""),
            ...parsedSize,
        },
        units,
        "jumbo"
    );
};

const apiUrl = `https://www.jumbo.com/api/graphql`;
const searchProducts = `\
query SearchProducts($input: ProductSearchInput!) {
  searchProducts(input: $input) {
    start
    count
    products {
      ...ProductDetails
      __typename
    }
    __typename
  }
}

fragment ProductDetails on Product {
  sku
  brand
  rootCategory
  packSizeDisplay
  title
  image
  inAssortment
  link
  prices: price {
    price
    promoPrice
    pricePerUnit {
      price
      unit
      __typename
    }
    __typename
  }
  primaryBadge: primaryProductBadges {
    alt
    image
    __typename
  }
  secondaryBadges: secondaryProductBadges {
    alt
    image
    __typename
  }
  badgeDescription
  promotions {
    id
    group
    isKiesAndMix
    image
    tags {
      text
      inverse
      __typename
    }
    start {
      dayShort
      date
      monthShort
      __typename
    }
    end {
      dayShort
      date
      monthShort
      __typename
    }
    attachments {
      type
      path
      __typename
    }
    primaryBadge: primaryBadges {
      alt
      image
      __typename
    }
    __typename
  }
  surcharges {
    type
    value {
      amount
      currency
      __typename
    }
    __typename
  }
  __typename
}
`;
const pageSize = 24;
const parallel = 20;

const searchPage = async (start) => {
    try {
        const { data } = await axios.post(apiUrl, {
            operationName: "SearchProducts",
            variables: {
                input: {
                    searchType: "category",
                    searchTerms: "producten",
                    friendlyUrl: "?searchType=category",
                    offSet: start,
                    currentUrl: "https://www.jumbo.com/producten/",
                    previousUrl: "https://www.jumbo.com/producten/",
                },
            },
            query: searchProducts,
        });
        return data.data.searchProducts;
    } catch (e) {
        console.error(`Failed to fetch products @ ${start}: ${e}`);
        return { products: [], count: Infinity };
    }
};

exports.fetchData = async () => {
    const allProducts = [];
    let productCount = Infinity;
    for (let start = 0; start < productCount; ) {
        const promises = [];
        for (let i = 0; i < parallel && start < productCount; i += 1) {
            promises.push(searchPage(start));
            start += pageSize;
        }
        const results = await Promise.all(promises);
        for (const { products, count } of results) {
            allProducts.push(...products);
            productCount = Math.min(productCount, count);
        }
    }
    return allProducts;
};

exports.categoryLookup = {};

exports.initializeCategoryMapping = async () => {};

exports.mapCategory = (rawItem) => {};
