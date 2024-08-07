import { GraphQLClient, gql } from "graphql-request";
import { ActionCable } from "@sorare/actioncable";
import chalk from "chalk";
import config from "./config.json" assert {type: 'json'};

const API_KEY = 'c3a68bc9e201bd3f0150c7ecd9cdeb3f997d8415750207ec36acc55ae9e6ba9fdea08ff136fe60c2a8b6b491f699f783f212dbe2819d144b80d97181b95sr128';

const Subscription = gql`
aCardWasUpdated(events: [offer_event_accepted]) 
{ 
    slug,
    rarity,
    averageScore(type: LAST_FIVE_SO5_AVERAGE_SCORE),
    inSeasonEligible,
    player {
      lastFifteenSo5Appearances,
      lastFiveSo5Appearances,
      position
    }
    tokenOwner,
    { 
      amounts
      {
          eur
      } 
    } 
}
`;

const error = chalk.bold.red;
const player = chalk.bold.blue;
const money = chalk.greenBright;

async function startCheck() {
  const cable = new ActionCable({
    url: 'wss://ws.sorare.com/cable',
    headers: {
      'APIKEY': API_KEY,
    },
  });

  cable.subscribe(Subscription, {
    connected() {
      console.log('connected');
    },

    disconnected() {
      console.log('disconnected');
    },

    rejected() {
      console.log('rejected');
    },

    received(data) {
      handleData(data);
    },
  });
}

function handleData(data) {
  if (!data["result"]["data"]["aCardWasUpdated"]) {
    return;
  }

  const owner = data["result"]["data"]["aCardWasUpdated"]["tokenOwner"];
  if (!owner) {
    return;
  }

  const amounts = data["result"]["data"]["aCardWasUpdated"]["tokenOwner"]["amounts"];
  if (!amounts) {
    return;
  }

  const price = data["result"]["data"]["aCardWasUpdated"]["tokenOwner"]["amounts"]["eur"] / 100.00;
  if (!price) {
    return;
  }

  const rarity = data["result"]["data"]["aCardWasUpdated"]["rarity"];

  if (rarity !== "limited" && rarity !== "rare") {
    return;
  }

  if (price < config["data"][rarity]["minPrice"]) {
    return;
  }

  const position = data["result"]["data"]["aCardWasUpdated"]["player"]["position"]
  if (!config["data"][rarity]["positions"].includes(position)) {
    return;
  }

  const inSeason = data["result"]["data"]["aCardWasUpdated"]["inSeasonEligible"]
  if (!config["data"][rarity]["inSeason"] === inSeason) {
    return;
  }

  const lastAppearances = data["result"]["data"]["aCardWasUpdated"]["player"]["lastFifteenSo5Appearances"]
  if (lastAppearances <= config["data"][rarity]["last15SO5Appearances"]) {
    return;
  }

  const slug = data["result"]["data"]["aCardWasUpdated"]["slug"];
  const splittedSlug = slug.split("-");
  const slugLength = splittedSlug.length;

  //create only player slug
  const cleanedSlug = splittedSlug.slice(0, slugLength - 3).join("-");

  queryLastPrices(rarity, cleanedSlug, price, slug, inSeason);
}

async function queryLastPrices(rarity, playerSlug, priceSold, wholeSlug, inSeason) {
  const graphQLClient = new GraphQLClient("https://api.sorare.com/federation/graphql", {
    headers: {
      'APIKEY': API_KEY,
    },
  });

  const data = await graphQLClient.request(getPriceQuery(rarity, playerSlug, inSeason));
  const priceArray = data["tokens"]["tokenPrices"];

  const pricesInEuro = priceArray.map((item) => item["amounts"]["eur"] / 100.00);
  const priceCount = pricesInEuro.length;

  const averagePrice = pricesInEuro.reduce(
    (previous, current) => previous + current
    , 0.0) / priceCount;
  const percentageOfAverage = (priceSold / averagePrice) * 100;


  const percentageToCheck = config["data"][rarity]["percentageOfPrice"]
  if (percentageOfAverage > percentageToCheck) {
    return;
  }

  const curDate = new Date();
  const datetime = `[${curDate.getDate()}/${curDate.getMonth() + 1}/${curDate.getFullYear()} ${curDate.getHours()}:${curDate.getMinutes()}:${curDate.getSeconds()}]`;

  console.log(datetime);
  console.log(player(wholeSlug));
  console.log(`Paid price: ${money(priceSold.toFixed(2))}€`)
  console.log(`Average Price: ${money(averagePrice.toFixed(2))}€`);
  console.log(`Percentage of sale: ${money(percentageOfAverage.toFixed(2))}%`);
  console.log(`Link: ${chalk.blueBright(`https://sorare.com/football/cards/${wholeSlug}`)}`);
  console.log("--------------------------------------------------------------------------");
}

function getPriceQuery(rarity, playerSlug, inSeason) {
  const compare = config["data"][rarity]["lastSales"]
  const season = inSeason ? "IN_SEASON" : "CLASSIC"
  return gql`
    query LastPrices {
      tokens {
        tokenPrices(first: ${compare}, rarity: ${rarity}, playerSlug: "${playerSlug}", seasonEligibility: ${season}) {
          amounts {
            eur
          }
        }
      }
    }
`;
}

function startProgramm() {
  console.log("Starting sorare fetch v0.1");
  try {
    startCheck();
  } catch (error) {
    console.log(`Error: ${error}`);
    startProgramm();
  }
}

startProgramm();
