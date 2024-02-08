export type CustomFeed = {
  link: string;
  description: string;
  title: string;
  image: string;
  items: CustomItem[];
};

export type CustomItem = {
  title: string;
  link: string;
  pubDate: string;
  content: string;
  contentSnippet: string;
  guid: string;
  categories: string[];
  isoDate: string;
};
