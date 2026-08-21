export type VideoSaga = {
  id: string;
  path: string;
  order: number;
  title: string;
};

export type VideoArc = {
  id: string;
  path: string;
  order: number;
  title: string;
  episodeStart: number | null;
  episodeEnd: number | null;
  sagaPath: string;
};

export type VideoEpisode = {
  id: string;
  path: string;
  number: number;
  title: string;
  arcPath: string;
};
