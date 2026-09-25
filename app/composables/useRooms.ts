import type {
  CallsResponse,
  MembershipsResponse,
  RoomHistoryResponse,
  RoomsResponse,
  UsersResponse,
} from "@/types/together";

export type Role = MembershipsResponse["role"];
export type MyRoom = MembershipsResponse<{ room: RoomsResponse }>;
export type Member = MembershipsResponse<{ user?: UsersResponse }>;
export type ActiveCallSummary = Pick<CallsResponse, "id" | "room" | "prayer" | "status">;

export interface NearbyRoom {
  id: string;
  name: string;
  default_place: string;
  distance_m: number;
  members: number;
}

export type RoomSettings = Partial<Pick<RoomsResponse, "name" | "default_place" | "discoverable" | "lat" | "lng">>;

/** Signed-out requests reject with this; pages show the sign-in gate instead. */
export class SignedOutError extends Error {}

/** The 8-character join code from whatever was typed or pasted (a code, or an invite link). */
export function normalizeCode(input: string): string {
  const fromLink = input.match(/\/r\/([A-Za-z0-9]{8})/)?.[1];
  return (fromLink ?? input).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export function inviteLink(code: string): string {
  return `https://meeqat.sanad.ink/r/${code}`;
}

/**
 * Rooms: my rooms, create/join/leave, owner edits, members, nearby discovery
 * and history. Every request goes through `ensureSession()`.
 */
export function useRooms() {
  const { pb, ensureSession } = useTogether();
  const { getCurrentPosition, error: locationError } = useGeolocation();

  async function session() {
    if (!(await ensureSession())) throw new SignedOutError();
    return pb();
  }

  async function myUserId(): Promise<string> {
    const id = (await session()).authStore.record?.id;
    if (!id) throw new SignedOutError();
    return id;
  }

  async function fetchMyRooms(): Promise<MyRoom[]> {
    const uid = await myUserId();
    return pb().collection("memberships").getFullList<MyRoom>({
      filter: pb().filter("user = {:uid}", { uid }),
      expand: "room",
      sort: "-created",
    });
  }

  /** Active calls across my subscribed rooms (the rules hide the rest). */
  async function fetchActiveCalls(): Promise<ActiveCallSummary[]> {
    return (await session()).collection("calls").getFullList<ActiveCallSummary>({
      filter: "status = 'open' || status = 'finalized'",
      fields: "id,room,prayer,status",
    });
  }

  async function createRoom(input: { name: string; default_place: string }): Promise<RoomsResponse> {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return (await session()).collection("rooms").create<RoomsResponse>({ ...input, tz });
  }

  async function joinByCode(code: string): Promise<RoomsResponse> {
    return (await session()).send<RoomsResponse>("/api/rooms/join", {
      method: "POST",
      body: { code: normalizeCode(code) },
    });
  }

  async function joinDiscoverable(roomId: string): Promise<RoomsResponse> {
    return (await session()).send<RoomsResponse>(`/api/rooms/${encodeURIComponent(roomId)}/join`, { method: "POST" });
  }

  async function fetchRoom(roomId: string): Promise<RoomsResponse> {
    return (await session()).collection("rooms").getOne<RoomsResponse>(roomId);
  }

  async function fetchMembers(roomId: string): Promise<Member[]> {
    return (await session()).collection("memberships").getFullList<Member>({
      filter: pb().filter("room = {:roomId}", { roomId }),
      expand: "user",
      sort: "created",
    });
  }

  async function fetchHistory(roomId: string): Promise<RoomHistoryResponse[]> {
    const page = await (await session()).collection("room_history").getList<RoomHistoryResponse>(1, 20, {
      filter: pb().filter("room = {:roomId}", { roomId }),
      sort: "-day,-created",
    });
    return page.items;
  }

  /** Leave = delete my own membership (the owner's can't be deleted). */
  async function leaveRoom(membershipId: string): Promise<void> {
    await (await session()).collection("memberships").delete(membershipId);
  }

  async function deleteRoom(roomId: string): Promise<void> {
    await (await session()).collection("rooms").delete(roomId);
  }

  async function setSubscribed(membershipId: string, subscribed: boolean): Promise<Member> {
    return (await session()).collection("memberships").update<Member>(membershipId, { subscribed }, { expand: "user" });
  }

  async function updateRoom(roomId: string, patch: RoomSettings): Promise<RoomsResponse> {
    return (await session()).collection("rooms").update<RoomsResponse>(roomId, patch);
  }

  async function rotateCode(roomId: string): Promise<RoomsResponse> {
    return (await session()).send<RoomsResponse>(`/api/rooms/${encodeURIComponent(roomId)}/rotate-code`, { method: "POST" });
  }

  async function setRole(roomId: string, userId: string, role: Exclude<Role, "owner">): Promise<void> {
    await (await session()).send(`/api/rooms/${encodeURIComponent(roomId)}/members/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: { role },
    });
  }

  async function removeMember(roomId: string, userId: string): Promise<void> {
    await (await session()).send(`/api/rooms/${encodeURIComponent(roomId)}/members/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
  }

  /**
   * A precise device position (never an IP guess) for room discovery. It is
   * only ever sent with a request, never stored on this device.
   */
  async function preciseLocation(): Promise<{ lat: number; lng: number }> {
    const pos = await getCurrentPosition({ precise: true });
    if (!pos) throw new Error(locationError.value ?? "Couldn't get your location");
    return pos;
  }

  /** Discoverable rooms within ~1 km of where I am now. */
  async function nearby(): Promise<NearbyRoom[]> {
    const client = await session();
    const { lat, lng } = await preciseLocation();
    return client.send<NearbyRoom[]>("/api/rooms/nearby", { query: { lat, lng } });
  }

  return {
    fetchMyRooms,
    fetchActiveCalls,
    createRoom,
    joinByCode,
    joinDiscoverable,
    fetchRoom,
    fetchMembers,
    fetchHistory,
    leaveRoom,
    deleteRoom,
    setSubscribed,
    updateRoom,
    rotateCode,
    setRole,
    removeMember,
    preciseLocation,
    nearby,
  };
}
