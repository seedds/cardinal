import type { SlabIndex } from './slab';
import type { SearchResultMetadata } from './search';

export type StatusBarUpdatePayload = {
  scannedFiles: number;
  processedEvents: number;
  rescanErrors: number;
};

export type IconUpdateWirePayload = {
  slabIndex: number;
  path: string;
  metadata: SearchResultMetadata | null;
  requestId: number;
  thumbnail: boolean;
  icon: string;
};

export type IconUpdatePayload = Omit<IconUpdateWirePayload, 'slabIndex'> & {
  slabIndex: SlabIndex;
};

export type RecentEventPayload = {
  path: string;
  flagBits: number;
  eventId: number;
  timestamp: number;
};

export type AppLifecycleStatus = 'Initializing' | 'Updating' | 'Ready';

export enum SearchStatusCode {
  OK = 0,
  CANCELLED = 1,
}

export type SearchResponsePayload = {
  results: number[];
  highlights?: string[];
  skippedCloudFiles?: number;
  statusCode: SearchStatusCode;
};
