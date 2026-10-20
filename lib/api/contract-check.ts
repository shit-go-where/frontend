/**
 * Compile-time drift check between the hand-written API types (./types.ts) that the UI uses
 * and the backend's generated OpenAPI schema (./schema.d.ts, `pnpm gen:api`).
 *
 * Each line asserts "what the backend sends is assignable to what the UI expects".
 * If the backend changes a response shape, `pnpm typecheck` fails here, naming the type.
 * This file has no runtime code.
 */
import type { Api } from "./client";
import type { components } from "./schema";
import type * as T from "./types";

type S = components["schemas"];
type Fits<Actual, Expected> = [Actual] extends [Expected] ? true : { mismatch: Actual; expected: Expected };
type Assert<X extends true> = X;
/** The body argument of an `api.*` call (lib/api/client.ts), for calls whose body type is written inline. */
type Body<K extends keyof Api, I extends number = 1> = NonNullable<Parameters<Api[K]>[I]>;

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
  Assert<Fits<S["VenueDetailDto_Output"], T.VenueDetail>>,
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
  Assert<Fits<S["TelegramLinkTokenDto_Output"], T.TelegramLinkToken>>,
  Assert<Fits<S["ReviewDto_Output"], T.Review>>,
  Assert<Fits<S["ReviewPageDto_Output"], T.Page<T.Review>>>,
  Assert<Fits<S["StatusReportListDto_Output"], T.List<T.StatusReport>>>,
  Assert<Fits<S["SubmissionListDto_Output"], T.List<T.SubmissionView>>>,
  Assert<Fits<S["VenueLiteListDto_Output"], T.List<T.VenueLite>>>,
  Assert<Fits<S["MediaPhotoRefDto_Output"], T.PhotoRef>>,
  // Request bodies: what the UI sends must be accepted by the backend.
  Assert<Fits<T.RecommendBody, S["RecommendBodyDto"]>>,
  Assert<Fits<T.CreateSubmissionBody, S["CreateSubmissionDto"]>>,
  Assert<Fits<T.UpdateSubmissionBody, S["UpdateSubmissionDto"]>>,
  Assert<Fits<T.ResolveSubmissionBody, S["ResolveDto"]>>,
  // Bodies written inline in lib/api/client.ts.
  Assert<Fits<Body<"postReview">, S["CreateReviewDto"]>>,
  Assert<Fits<Body<"checkIn">, S["CheckInDto"]>>,
  Assert<Fits<Body<"verify">, S["VerifyDto"]>>,
  Assert<Fits<Body<"vote">, S["VoteDto"]>>,
  Assert<Fits<Body<"updateMe", 0>, S["UpdateMeDto"]>>,
  Assert<Fits<Body<"presign", 0>, S["PresignDto"]>>,
  Assert<Fits<Body<"devLogin", 0>, S["DevLoginBody"]>>,
  Assert<Fits<{ reason: Body<"flagToilet"> }, S["CreateFlagDto"]>>,
  Assert<Fits<{ kind: Body<"reportStatus">; afterRoute?: true }, S["CreateStatusDto"]>>,
  Assert<Fits<{ toiletId: Body<"routingStarted", 0> }, S["RouteStartedBodyDto"]>>,
];
