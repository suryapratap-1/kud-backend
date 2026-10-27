/** What the public review page needs to know about a space. */
export type PublicSpace = {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  ownerName: string;
  prompts: string[];
  /** Video reviews are a Pro feature of the space owner. */
  allowVideo: boolean;
  stats: { reviews: number; average: number };
};
