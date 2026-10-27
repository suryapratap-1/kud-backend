// The response shape of GET /widgets/:id. Must match `WidgetPayload` in the frontend's
// apps/widget/src/render.ts, which renders it. Change both together.

export type WidgetLayout = "wall" | "carousel" | "marquee";
export type WidgetTheme = "light" | "dark" | "auto";

export type WidgetReview = {
  id: string;
  rating: number;
  text: string;
  authorName: string;
  authorRole: string | null;
  photoUrl: string | null;
  videoUrl: string | null;
};

export type WidgetPayload = {
  layout: WidgetLayout;
  theme: WidgetTheme;
  settings: { accent: string; showRating: boolean; showPhotos: boolean; showRole: boolean };
  reviews: WidgetReview[];
  branding: { show: boolean; url: string };
};
