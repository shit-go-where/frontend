/**
 * Compile-time drift check between the hand-written API types (./types.ts) that the UI uses
 * and the backend's generated OpenAPI schema (./schema.d.ts, `pnpm gen:api`).
 *
 * Each line asserts "what the backend sends is assignable to what the UI expects".
 * If the backend changes a response shape, `pnpm typecheck` fails here, naming the type.
 * This file has no runtime code.
 */
import type { components } from "./schema";
import type * as T from "./types";

type S = components["schemas"];
type Fits<Actual, Expected> = [Actual] extends [Expected] ? true : { mismatch: Actual; expected: Expected };
type Assert<X extends true> = X;

export type ContractChecks = [
  Assert<Fits<S["ToiletSummary_Output"], T.ToiletSummary>>,
  Assert<Fits<S["ToiletPin_Output"], T.ToiletPin>>,
  Assert<Fits<S["ToiletDetailDto_Output"], T.ToiletDetail>>,
  Assert<Fits<S["VenueLite_Output"], T.VenueLite>>,
  Assert<Fits<S["Survey_Output"], T.Survey>>,
  Assert<Fits<S["Review_Output"], T.Review>>,
  Assert<Fits<S["StatusReport_Output"], T.StatusReport>>,
  Assert<Fits<S["MeDto_Output"], T.Me>>,
  Assert<Fits<S["RecommendResponseDto_Output"], T.RecommendResponse>>,
  Assert<Fits<S["WalkResponseDto_Output"], T.WalkRoute>>,
  Assert<Fits<S["SubmissionViewDto_Output"], T.SubmissionView>>,
  Assert<Fits<S["CheckInResultDto_Output"], T.CheckInResult>>,
  Assert<Fits<S["PassportDto_Output"], T.Passport>>,
  Assert<Fits<S["LeaderboardDto_Output"], T.UserLeaderboard>>,
  Assert<Fits<S["ToiletLeaderboardDto_Output"], T.ToiletLeaderboard>>,
  Assert<Fits<S["AreaListDto_Output"]["items"][number], T.AreaSummary>>,
  Assert<Fits<S["AreaDetailDto_Output"], T.AreaDetail>>,
  Assert<Fits<S["ToiletSitemapDto_Output"]["items"][number], T.SitemapToilet>>,
  Assert<Fits<S["PresignResultDto_Output"], T.PresignResponse>>,
  Assert<Fits<S["DataQualityDto_Output"], T.DataQuality>>,
  Assert<Fits<S["VenueNearbyListDto_Output"]["items"][number], T.NearbyVenue>>,
  Assert<Fits<S["AdminFlagListDto_Output"]["items"][number], T.AdminFlag>>,
  Assert<Fits<S["PendingPhotoListDto_Output"]["items"][number], T.PendingPhoto>>,
  Assert<Fits<S["ImportRunListDto_Output"]["items"][number], T.ImportRun>>,
  Assert<Fits<S["ActivityPageDto_Output"]["items"][number], T.ActivityItem>>,
  Assert<Fits<S["BadgeListDto_Output"]["items"][number], T.Badge>>,
  Assert<Fits<S["GeoSearchResponseDto_Output"]["items"][number], T.GeoSearchResult>>,
  Assert<Fits<S["ModeratorSubmissionListDto_Output"]["items"][number], T.ModeratorSubmission>>,
  Assert<Fits<S["StatusReportDto_Output"], T.StatusReport>>,
  Assert<Fits<S["ActivitySeenDto_Output"], T.ActivitySeen>>,
  Assert<Fits<S["StationListDto_Output"]["items"][number], T.StationSummary>>,
  Assert<Fits<S["StationDetailDto_Output"], T.StationDetail>>,
  Assert<Fits<S["LineBoardDto_Output"]["items"][number], T.LineRow>>,
  // Request bodies: what the UI sends must be accepted by the backend.
  Assert<Fits<T.RecommendBody, S["RecommendBodyDto"]>>,
  Assert<Fits<T.CreateSubmissionBody, S["CreateSubmissionDto"]>>,
  Assert<Fits<T.UpdateSubmissionBody, S["UpdateSubmissionDto"]>>,
  Assert<Fits<T.ResolveSubmissionBody, S["ResolveDto"]>>,
];
