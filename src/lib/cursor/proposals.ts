export type AssistantProposal = {
  id: string;
  kind: "move" | "issue";
  title: string;
  body: string;
};

export type ProposedAction = Omit<AssistantProposal, "id"> & {
  execute(): Promise<string>;
};
