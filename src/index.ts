import * as TelegramBot from "node-telegram-bot-api";
import * as Parser from "rss-parser";
import { CustomFeed, CustomItem } from "src/types";
require("dotenv").config();
const { JSDOM } = require("jsdom");

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is not set");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

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

const baseURL = "https://thedealersden.com";

const getFeed = async (feed: Feed) => {
  return await parser.parseURL(`${baseURL}/rss/feed/${feed}`);
};

bot.onText(/\/echo (.+)/, (msg, match) => {
  if (!match) return;
  const chatId = msg.chat.id;
  const resp = match[1];
  bot.sendMessage(chatId, resp);
});

const getItemCategories = (categories: string[]) => {
  const category = categories[0];
  if (!category) return "";
  return category
    .split("::") // split by :: to get the main category (e.g. Artwork)
    .map((c) => `#${c.trim().replace(" ", "_")}`) // replace spaces with underscores and add # to the beginning
    .join(", "); // join by comma
};

function formatContentForTelegram(content) {
  const textOnly = content.replace(/<\/?[^>]+(>|$)/g, "");
  const dom = new JSDOM(`<!DOCTYPE html><body>${textOnly}`);
  const decodedString = dom.window.document.querySelector("body").textContent;
  const finalText = decodedString.replace(/\r\n/g, "\n");
  return finalText;
}

const sendItem = (item: CustomItem, chatId: number) => {
  //  title, publication date, content, snippet, link, categories

  const message = `
<b>${item.title}</b>

<b>Content:</b> ${formatContentForTelegram(item.content)}

<b>Publication Date:</b> ${new Date(item.isoDate).toString()}

<a href="${item.link}">Link</a>, <b>Categories:</b> ${getItemCategories(
    item.categories
  )}
`;

  // const photoUrl = getPhtoUrl(item.content);
  bot.sendMessage(chatId, message, { parse_mode: "HTML" });
};

let liveModeTimerId: NodeJS.Timer | null = null;
type LiveModeItem = {
  number: NodeJS.Timer;
};

const liveModeTimers: { [key: string]: LiveModeItem } = {};

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
      sendItem(item, chatId);
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
      sendItem(newItem, chatId);
    }
  }, 5000);
};

const helpMessage = () => {
  const commands = feeds.map((feed) => feed.command).join(", ");
  return `Available commands: ${commands}`;
};

bot.on("message", async (msg) => {
  console.log("Message received from chat: ", msg.chat.id, ":", msg.text);
  const chatId = msg.chat.id;
  bot.sendChatAction(chatId, "typing");
  if (msg.entities && msg.entities[0].type === "bot_command") {
    if (msg.text === "/help" || msg.text === "/start") {
      bot.sendMessage(chatId, helpMessage());
      return;
    }
    console.log("bot command received");

    const commandInfo = feeds.find((feed) => feed.command === msg.text);
    if (!commandInfo) return;
    const feedType = msg.text === "/live" ? "recent" : (msg.text as Feed);
    const feed = await getFeed(feedType);
    const items = feed.items;

    bot.sendMessage(chatId, commandInfo.answerMessage);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    if (msg.text === "/live") {
      if (liveMode(items, chatId)) {
        bot.sendMessage(chatId, `Live mode turned off.`);
      }
      return;
    }

    items.forEach((item) => {
      sendItem(item, chatId);
    });
  } else {
    bot.sendMessage(
      chatId,
      "I don't know what you mean. Tey /help for... Help?"
    );
  }

  // send a message to the chat acknowledging receipt of their message
  // bot.sendMessage(chatId, "Received your message");
});

bot.on("sticker", (msg) => {
  // console.log(msg);
  console.log("Sticker received");
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Are you trying to bully me? What if I like it?");
  bot.sendSticker(
    chatId,
    "CAACAgIAAxkBAAIHRGSpTgvl4e32-udeSYQ_cTihXzdiAAIzKwACHUKASkXTTjAEbGd4LwQ"
  );
});

bot.on("inline_query", (msg) => {
  console.log("Inline query received");
  console.log(msg);
});
