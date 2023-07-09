import * as TelegramBot from "node-telegram-bot-api";
import * as Parser from "rss-parser";
require("dotenv").config();

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

const baseURL = "https://thedealersden.com";

const getFeed = async (feed: Feed) => {
  return await parser.parseURL(`${baseURL}/rss/feed/${feed}`);
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

const mockData = [
  {
    title: "Cute Base Commission",
    link: "https://www.thedealersden.com/listing/cute-base-commission/237711",
    pubDate: "Mon, 26 Jun 2023 23:22:03 -0400",
    guid: "https://www.thedealersden.com/listing/cute-base-commission/237711",
    content:
      '<p><img alt="Cute Base Commission" class="" src="/uploads/cache/Untitled35_20230508205630-200x200.png"></p>My First Commission! I will draw your fursona holding their favorite item! You can choose the background color as well!',
    contentSnippet:
      "My First Commission! I will draw your fursona holding their favorite item! You can choose the background color as well!",
    categories: ["Artwork :: Originals"],
    isoDate: "2023-06-27T03:22:03.000Z",
  },
  {
    title: "Dino mask",
    link: "https://www.thedealersden.com/listing/dino-mask/237710",
    pubDate: "Mon, 26 Jun 2023 23:18:30 -0400",
    guid: "https://www.thedealersden.com/listing/dino-mask/237710",
    content:
      '<p><img alt="Dino mask" class="" src="/uploads/cache/E07E65E9-2D7F-458C-8525-145BAB1F711F-200x200.jpeg"></p>Price lowered :)',
    contentSnippet: "Price lowered :)",
    categories: ["Fursuits :: Partial Suits"],
    isoDate: "2023-06-27T03:18:30.000Z",
  },
];

const getPhtoUrl = (content: string) => {
  const regex = /src="([^"]*)"/g;
  const match = regex.exec(content);
  if (!match) return "";
  return `${baseURL}${match[1]}`;
};

const getItemCategories = (categories: string[]) => {
  const category = categories[0];
  if (!category) return "";
  return category
    .split("::") // split by :: to get the main category (e.g. Artwork)
    .map((c) => `#${c.trim().replace(" ", "_")}`) // replace spaces with underscores and add # to the beginning
    .join(", "); // join by comma
};

const sendItem = (item: CustomItem, chatId: number) => {
  const message = `${item.title}\n${item.link} 
  \nCategories: ${getItemCategories(item.categories)}`;

  // const photoUrl = getPhtoUrl(item.content);
  bot.sendMessage(chatId, message);
};

let liveModeTimerId: NodeJS.Timer | null = null;
type LiveModeItem = {
  number: NodeJS.Timer;
};

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
  console.log("Message received");
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, helpMessage());
  if (msg.entities && msg.entities[0].type === "bot_command") {
    if (msg.text === "/help") {
      bot.sendChatAction(chatId, "typing");
      return;
    }
    console.log("bot command received");

    const commandInfo = feeds.find((feed) => feed.command === msg.text);
    if (!commandInfo) return;
    const feedType = msg.text === "/live" ? "recent" : (msg.text as Feed);
    console.log("Message received");
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
