import { GraphQLClient, gql } from "graphql-request";
import { ActionCable } from "@sorare/actioncable";
import config from "./config.json" assert {type: 'json'};

const API_KEY = 'c3a68bc9e201bd3f0150c7ecd9cdeb3f997d8415750207ec36acc55ae9e6ba9fdea08ff136fe60c2a8b6b491f699f783f212dbe2819d144b80d97181b95sr128';
const SALES_TO_COMPARE = 20;
const PERCENTAGE_TO_CHECK = 80.0;

const Subscription = gql`
aCardWasUpdated(events: [offer_event_accepted, auction_event_closed]) 
{ 
    slug,
    rarity,
    averageScore(type: LAST_FIVE_SO5_AVERAGE_SCORE),
    token,
    { 
        owner 
        { 
            price
            {
                eur
            } 
        }
    } 
}
`;

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
    // console.log("result is null");
    return;
  }

  const owner = data["result"]["data"]["aCardWasUpdated"]["token"]["owner"];
  if (!owner) {
    return;
  }


  const price = data["result"]["data"]["aCardWasUpdated"]["token"]["owner"]["price"]["eur"] / 100.00;
  if (!price) {
    return;
  }

  const slug = data["result"]["data"]["aCardWasUpdated"]["slug"];
  const splittedSlug = slug.split("-");
  const slugLength = splittedSlug.length;

  //create only player slug
  const cleanedSlug = splittedSlug.slice(0, slugLength - 3).join("-");
  const rarity = data["result"]["data"]["aCardWasUpdated"]["rarity"];
  console.log(rarity);

  queryLastPrices(rarity, cleanedSlug, price, slug);
}

async function queryLastPrices(rarity, playerSlug, priceSold, wholeSlug) {
  const graphQLClient = new GraphQLClient("https://api.sorare.com/federation/graphql", {
    headers: {
      'APIKEY': API_KEY,
    },
  });

  const data = await graphQLClient.request(getPriceQuery(rarity, playerSlug));
  const priceArray = data["tokens"]["tokenPrices"];

  const pricesInEuro = priceArray.map((item) => item["amounts"]["eur"] / 100.00);

  const priceCount = pricesInEuro.length;
  const averagePrice = pricesInEuro.reduce(
    (previous, current) => previous + current
    , 0.0) / priceCount;
  const percentageOfAverage = (priceSold / averagePrice) * 100;

  if (percentageOfAverage > PERCENTAGE_TO_CHECK) return;

  const curDate = new Date();
  const datetime = `[${curDate.getDate()}/${curDate.getMonth() + 1}/${curDate.getFullYear()} ${curDate.getHours()}:${curDate.getMinutes()}:${curDate.getSeconds()}]`;

  console.log(datetime);
  console.log(wholeSlug);
  console.log(`Paid price: ${priceSold.toFixed(2)}€`)
  console.log(`Average Price: ${averagePrice.toFixed(2)}€`);
  console.log(`Percentage of sale: ${percentageOfAverage.toFixed(2)}%`);
  console.log(`Link: https://sorare.com/football/cards/${wholeSlug}`);
  console.log("--------------------------------------------------------------------------");
}

function getPriceQuery(rarity, playerSlug) {
  return gql`
    query LastPrices {
      tokens {
        tokenPrices(first: ${SALES_TO_COMPARE}, collection: FOOTBALL, rarity: ${rarity}, playerSlug: "${playerSlug}") {
          amounts {
            eur
          }
        }
      }
    }
`;
}

function startProgramm() {
  console.log(config["data"]["COMMON"]);
  console.log("Starting sorare fetch v0.1");
  try {
    startCheck();
  } catch (error) {
    console.log(`Error: ${error}`);
    startProgramm();
  }
}

startProgramm();
