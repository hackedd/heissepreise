const axios = require("axios");
const utils = require("./utils");
const { CookieJar } = require("tough-cookie");
const { wrapper } = require("axios-cookiejar-support");

exports.urlBase = "https://www.ah.nl/producten/";

const units = {
    blik: { unit: "stk", factor: 1 },
    bos: { unit: "stk", factor: 1 },
    bosje: { unit: "stk", factor: 1 },
    bundel: { unit: "stk", factor: 1 },
    doos: { unit: "stk", factor: 1 },
    flessen: { unit: "stk", factor: 1 },
    krop: { unit: "stk", factor: 1 },
    pakket: { unit: "stk", factor: 1 },
    plakjes: { unit: "stk", factor: 1 },
    rol: { unit: "stk", factor: 1 },
    sachets: { unit: "stk", factor: 1 },
    stuk: { unit: "stk", factor: 1 },
    stuks: { unit: "stk", factor: 1 },
    tabl: { unit: "stk", factor: 1 },
    tabletten: { unit: "stk", factor: 1 },
    tros: { unit: "stk", factor: 1 },
    wasbeurten: { unit: "stk", factor: 1 },

    gram: { unit: "g", factor: 1 },
    kilogram: { unit: "g", factor: 1000 },
    kilo: { unit: "g", factor: 1000 },
};

const parseUnitSize = (unitSize) => {
    if (!unitSize) {
        return { unit: "stk", factor: 1 };
    }

    unitSize = unitSize
        .trim()
        .toLocaleLowerCase()
        .replace(/^(ca\.?|los per|per)\s?/g, "");

    let match;
    // 12 x 0,33 l
    // 6x150g
    if ((match = unitSize.match(/^(\d+)\s?x\s?(.*)$/i)) !== null) {
        const factor = parseInt(match[1]);
        const { unit, quantity } = parseUnitSize(match[2]);
        return { unit, quantity: quantity * factor };
    }

    // 275 ml
    // 0,33 l
    // 500ml
    if ((match = unitSize.match(/([0-9.,]+)\s?([a-z]+)/)) !== null) {
        return { unit: match[2], quantity: match[1] };
    }

    // per stuk
    if (!unitSize.includes(" ")) {
        return { unit: unitSize, quantity: 1 };
    }

    return null;
};

exports.getCanonical = (item, today) => {
    const unitSize = item.price.unitSize;

    const parsedSize = parseUnitSize(unitSize);
    if (!parsedSize) {
        console.log(`Failed to parse unit size '${unitSize}' in item ${item.title}`);
    }

    return utils.convertUnit(
        {
            id: item.id,
            name: item.title,
            // isWeighted,
            price: item.price.now,
            priceHistory: [{ date: today, price: item.price.now }],
            bio: item.propertyIcons.some((icon) => icon.name === "biologisch"),
            url: item.link.replace(/^\/producten\//, ""),
            ...parsedSize,
        },
        units,
        "ah"
    );
};

const apiUrl = `https://www.ah.nl/zoeken/api`;
const pageSize = 1000;

const fetchProducts = async (client, taxonomySlug, page) => {
    const url = `${apiUrl}/products/search?taxonomySlug=${taxonomySlug}&page=${page}&size=${pageSize}`;
    try {
        const { data } = await client.get(url);
        return data.cards.map((card) => card.products).flat();
    } catch (e) {
        console.error(`Failed to fetch ${taxonomySlug} @ ${url}: ${e}`);
        return [];
    }
};

const createClient = async () => {
    // Create an Axios client that keeps cookies
    const jar = new CookieJar();
    const client = wrapper(axios.create({ jar }));

    // Request the homepage to get the cookies, without this we get a 403 on API requests
    await client.get(exports.urlBase);

    return client;
};

exports.fetchData = async () => {
    const client = await createClient();

    const { data: topLevelTaxonomies } = await client.get(`${apiUrl}/taxonomy/top-level`);

    const promises = [];
    for (const taxonomy of topLevelTaxonomies) {
        // It seems that `totalProductCount` is an overestimate, so some of these requests will fail.
        for (let i = 0, page = 0; i < taxonomy.totalProductCount; i += pageSize, page++) {
            promises.push(fetchProducts(client, taxonomy.slugifiedName, page));
        }
    }

    const allProducts = await Promise.all(promises);
    return allProducts.flat();
};

exports.categoryLookup = {};

exports.initializeCategoryMapping = async () => {
    const client = await createClient();

    const { data: topLevelTaxonomies } = await client.get(`${apiUrl}/taxonomy/top-level`);
    topLevelTaxonomies.sort((a, b) => a.id - b.id);

    const categories = topLevelTaxonomies.map((taxonomy) => ({
        id: taxonomy.id,
        description: taxonomy.name,
        url: `${exports.urlBase}${taxonomy.slugifiedName}`,
    }));

    const mergedCategories = utils.mergeAndSaveCategories("ah", categories);

    exports.categoryLookup = {};
    for (const category of mergedCategories) {
        exports.categoryLookup[category.id] = category;
    }
};

exports.mapCategory = (rawItem) => {
    const taxonomyId = rawItem.taxonomies.find((taxonomy) => taxonomy.level === 1).id;
    return exports.categoryLookup[taxonomyId]?.code;
};
