import * as TelegramBot from "node-telegram-bot-api";
import * as Parser from "rss-parser";
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    console.error("TELEGRAM_BOT_TOKEN is not set");
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

type CustomFeed = {
  link: string;
  description: string;
  title: string;
  image: string;
  items: CustomItem[];
};

type CustomItem = {
  title: string;
  link: string;
  pubDate: string;
  content: string;
  contentSnippet: string;
  guid: string;
  categories: string[];
  isoDate: string;
};

const parser: Parser<CustomFeed, CustomItem> = new Parser({
  customFields: {
    feed: ["link", "description", "title", "image", "items"],
    item: [
      "title",
      "link",
      "pubDate",
      "content",
      "contentSnippet",
      "guid",
      "categories",
      "isoDate",
    ],
  },
});

const FeedTypes = ["homepage", "recent", "ending", "popular"] as const;
type Feed = (typeof FeedTypes)[number];
const feeds = [
  {
    name: "homepage",
    description: "The Dealers Den Homepage",
    answerMessage: "Here is the homepage list:",
    command: "/homepage",
  },
  {
    name: "recent",
    description: "The Dealers Den Recent",
    answerMessage: "Here is the recent list:",
    command: "/recent",
  },
  {
    name: "ending",
    description: "The Dealers Den Ending",
    answerMessage: "Here is the ending list:",
    command: "/ending",
  },
  {
    name: "popular",
    description: "The Dealers Den Popular",
    answerMessage: "Here is the popular list:",
    command: "/popular",
  },
  {
    name: "live",
    description: "Enables Live Auctions mode",
    answerMessage: `The Live Auctions mode is enabled. I'll send you a message when a new item is added to the recent feed. The last 3 items are sent to you now:`,
    command: "/live",
  },
];

const getFeed = async (feed: Feed) => {
  return await parser.parseURL(
    `https://www.thedealersden.com/rss/feed/${feed}`
  );
};

bot.onText(/\/echo (.+)/, (msg, match) => {
  // 'msg' is the received Message from Telegram
  // 'match' is the result of executing the regexp above on the text content
  // of the messages
  if (!match) return;

  const chatId = msg.chat.id;
  const resp = match[1]; // the captured "whatever"

  // send back the matched "whatever" to the chat
  bot.sendMessage(chatId, resp);
});

// Listen for any kind of message. There are different kinds of
// messages.

const addItemIfNotExists = (items, item) => {
  if (items.every((i) => i.link !== item.link)) {
    items.push(item);
    return true;
  }
  return false;
};

let liveModeTimerId: NodeJS.Timer | null = null;

const liveMode = (items_: CustomItem[], chatId: number) => {
  // check if polling is already running, and turn it off
  if (liveModeTimerId) {
    clearInterval(liveModeTimerId);
    liveModeTimerId = null;
    return true;
  }
  const seen = [...items_]; // copy the array so that it doesn't get mutated by sort()
  seen.sort(
    (a, b) => new Date(b.isoDate).getTime() - new Date(a.isoDate).getTime()
  );

  // send three initial listings right away
  seen
    .slice(0, 3)
    .reverse()
    .forEach((item) => {
      bot.sendMessage(chatId, `${item.title} - ${item.link}`);
    });

  // then set up polling
  liveModeTimerId = setInterval(async function liveModePollingFn() {
    const newFeed = await getFeed("recent");
    const oldLinks = seen.map(({ link }) => link);

    // only leave items with links we haven't seen
    const newItems = newFeed.items.filter((newItem) => {
      return !oldLinks.includes(newItem.link);
    });

    if (newItems.length === 0) return;

    console.log("New item!");
    newItems.forEach((ni) => seen.push(ni)); // add new items to seen

    for (const newItem of newItems) {
      bot.sendMessage(chatId, `${newItem.title} - ${newItem.link}`);
    }
  }, 5000);
};

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  if (msg.entities && msg.entities[0].type === "bot_command") {
    // console.log(msg);

    const commandInfo = feeds.find((feed) => feed.command === msg.text);
    if (!commandInfo) return;
    const feedType = msg.text === "/live" ? "recent" : (msg.text as Feed);
    console.log("Message received");
    const feed = await getFeed(feedType);
    const items = feed.items;

    console.log(
      items.map((i) => {
        console.log(i.categories);
        if (i.categories.filter((c) => c.includes("Fursuit")).length > 0) {
          return i;
        }
      })
    );

    bot.sendMessage(chatId, commandInfo.answerMessage);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    if (msg.text === "/live") {
      if (liveMode(items, chatId)) {
        bot.sendMessage(chatId, `Live mode turned off.`);
      }
      return;
    }

    items.forEach((item) => {
      bot.sendMessage(chatId, `${item.title} - ${item.link}`);
    });
  }

  // send a message to the chat acknowledging receipt of their message
  bot.sendMessage(chatId, "Received your message");
});
