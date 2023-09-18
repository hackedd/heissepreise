const axios = require("axios");
const utils = require("./utils");

const apiUrl = `https://api.dekamarkt.nl/v1`;
const apiKey = "6d3a42a3-6d93-4f98-838d-bcc0ab2307fd";
const storeId = 283;
const formulaId = 1;

// Converts a string to a URL-friendly slug. Not very elegant, but matches behaviour of the website.
const formatLink = (link) =>
    link
        .replace(/,/g, "-")
        .replace(/\./g, "-")
        .replace(" & ", "-")
        .replace(/&/g, "-")
        .replace(/ /g, "-")
        .replace(/'/g, "-")
        .replace(/\//g, "-")
        .replace(/%/g, "-")
        .replace("+", "")
        .replace(/\*/g, "")
        .replace(/---/g, "-")
        .replace(/--/g, "-")
        .replace(/-$/g, "")
        .toLowerCase();

exports.urlBase = "https://www.dekamarkt.nl/producten/";

const groupUrl = (department, group) => `${exports.urlBase}${formatLink(department.Description)}/${formatLink(group.Description)}`;

const units = {};

const findPrice = (item, today) => {
    // StartDate and EndDate are in the format "2021-03-03T00:00:00", but often don't start at midnight, so we just ignore the time completely.
    for (const offer of item.ProductOffers) {
        if (offer.Offer.StartDate.substring(0, 10) <= today && offer.Offer.EndDate.substring(0, 10) >= today) {
            // TODO: Handle "buy two, get one free" type offers
            return offer.OfferPrice;
        }
    }
    for (const price of item.ProductPrices) {
        if (price.StartDate.substring(0, 10) <= today && price.EndDate.substring(0, 10) >= today) {
            return price.Price;
        }
    }
    console.warn(`No current price found for ${item.ProductID} ${item.MainDescription}`);
};

exports.getCanonical = (item, today) => {
    const price = findPrice(item, today);
    const name = [item.Brand, item.MainDescription, item.SubDescription].filter(Boolean).join(" ");
    const group = item.WebSubGroups[0].WebGroup;
    const linkName = formatLink(`${name} ${item.CommercialContent}`);

    return utils.convertUnit(
        {
            id: item.ProductID,
            name,
            description: item.ExtraDescription,
            isWeighted: item.ScaleIndicator,
            price,
            priceHistory: [{ date: today, price }],
            unit: item.UnitContentCE,
            quantity: item.ContentCE,
            bio: item.Biological,
            url: `${groupUrl(group.WebDepartment, group)}/${linkName}/${item.ProductID}`,
        },
        units,
        "dekamarkt"
    );
};

const fetchSubGroup = async (group, subGroup) => {
    const url = `${apiUrl}/assortmentcache/group/${storeId}/${subGroup.WebSubGroupID}?api_key=${apiKey}`;
    try {
        const { status, data } = await axios.get(url, {
            validateStatus: (status) => (status >= 200 && status < 300) || status === 404,
        });
        return status === 404 && data === "No products found" ? [] : data;
    } catch (e) {
        console.error(`Failed to fetch ${group.Description} -> ${subGroup.Description} @ ${url}: ${e}`);
        return [];
    }
};

exports.fetchData = async () => {
    const { data: departments } = await axios.get(`${apiUrl}/departments/?api_key=${apiKey}&formulaID=${formulaId}`);

    const promises = [];
    for (const department of departments) {
        for (const group of department.WebGroups) {
            for (const subGroup of group.WebSubGroups) {
                promises.push(fetchSubGroup(group, subGroup));
            }
        }
    }

    const allProducts = {};
    for (const products of await Promise.all(promises)) {
        for (const product of products) {
            allProducts[product.ProductID] = product;
        }
    }
    return Object.values(allProducts);
};

exports.categoryLookup = {};

exports.initializeCategoryMapping = async () => {
    const { data: departments } = await axios.get(`${apiUrl}/departments/?api_key=${apiKey}&formulaID=${formulaId}`);

    const categories = [];
    for (const department of departments) {
        for (const group of department.WebGroups) {
            categories.push({
                id: group.WebGroupID,
                description: `${department.Description} -> ${group.Description}`,
                url: groupUrl(department, group),
            });
        }
    }

    categories.sort((a, b) => a.id - b.id);
    const mergedCategories = utils.mergeAndSaveCategories("dekamarkt", categories);

    exports.categoryLookup = {};
    for (const category of mergedCategories) {
        exports.categoryLookup[category.id] = category;
    }
};

exports.mapCategory = (rawItem) => {
    const groupId = rawItem.WebSubGroups[0].WebGroup.WebGroupID;
    return exports.categoryLookup[groupId]?.code;
};
