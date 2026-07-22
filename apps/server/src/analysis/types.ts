import type {
  ControllerEndpoint,
  EnumCandidate,
  EnumMember,
  SourceLocation,
} from "@cr/contracts";

export type AnalyzedEnum = EnumCandidate & {
  members: EnumMember[];
};

export type AnalyzedSymbol = {
  name: string;
  relativePath: string;
  location: SourceLocation;
};

export type AnalysisResult = {
  controllers: ControllerEndpoint[];
  enums: AnalyzedEnum[];
  symbols: AnalyzedSymbol[];
};

export const EMPTY_ANALYSIS: AnalysisResult = {
  controllers: [],
  enums: [],
  symbols: [],
};
