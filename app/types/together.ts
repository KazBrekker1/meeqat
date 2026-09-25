/**
* This file was @generated using pocketbase-typegen
*/

import type PocketBase from 'pocketbase'
import type { RecordService } from 'pocketbase'

export const Collections = {
	Authorigins: "_authOrigins",
	Externalauths: "_externalAuths",
	Mfas: "_mfas",
	Otps: "_otps",
	Superusers: "_superusers",
	Calls: "calls",
	Memberships: "memberships",
	Messages: "messages",
	Participants: "participants",
	PollOptions: "poll_options",
	PollVotes: "poll_votes",
	RoomHistory: "room_history",
	Rooms: "rooms",
	Users: "users",
} as const
export type Collections = typeof Collections[keyof typeof Collections]

// Alias types for improved usability
export type IsoDateString = string
export type IsoAutoDateString = string & { readonly autodate: unique symbol }
export type RecordIdString = string
export type FileNameString = string & { readonly filename: unique symbol }
export type HTMLString = string

type ExpandType<T> = unknown extends T
	? T extends unknown
		? { expand?: unknown }
		: { expand: T }
	: { expand: T }

// System fields
export type BaseSystemFields<T = unknown> = {
	id: RecordIdString
	collectionId: string
	collectionName: Collections
} & ExpandType<T>

export type AuthSystemFields<T = unknown> = {
	email: string
	emailVisibility: boolean
	username: string
	verified: boolean
} & BaseSystemFields<T>

// Record types for each collection

export type AuthoriginsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	fingerprint: string
	id: string
	recordRef: string
	updated: IsoAutoDateString
}

export type ExternalauthsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	provider: string
	providerId: string
	recordRef: string
	updated: IsoAutoDateString
}

export type MfasRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	method: string
	recordRef: string
	updated: IsoAutoDateString
}

export type OtpsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	password: string
	recordRef: string
	sentTo?: string
	updated: IsoAutoDateString
}

export type SuperusersRecord = {
	created: IsoAutoDateString
	email: string
	emailVisibility?: boolean
	id: string
	password: string
	tokenKey: string
	updated: IsoAutoDateString
	verified?: boolean
}

export const CallsPrayerOptions = {
	"fajr": "fajr",
	"dhuhr": "dhuhr",
	"asr": "asr",
	"maghrib": "maghrib",
	"isha": "isha",
	"jumuah": "jumuah",
} as const
export type CallsPrayerOptions = typeof CallsPrayerOptions[keyof typeof CallsPrayerOptions]

export const CallsStatusOptions = {
	"open": "open",
	"finalized": "finalized",
	"ended": "ended",
	"cancelled": "cancelled",
} as const
export type CallsStatusOptions = typeof CallsStatusOptions[keyof typeof CallsStatusOptions]
export type CallsRecord = {
	created: IsoAutoDateString
	day: string
	id: string
	meet_at?: IsoDateString
	organizer: RecordIdString
	place?: string
	place_changed_at?: IsoDateString
	prayer: CallsPrayerOptions
	room: RecordIdString
	status: CallsStatusOptions
	updated: IsoAutoDateString
}

export const MembershipsRoleOptions = {
	"owner": "owner",
	"caller": "caller",
	"member": "member",
} as const
export type MembershipsRoleOptions = typeof MembershipsRoleOptions[keyof typeof MembershipsRoleOptions]
export type MembershipsRecord = {
	created: IsoAutoDateString
	id: string
	role: MembershipsRoleOptions
	room: RecordIdString
	subscribed?: boolean
	updated: IsoAutoDateString
	user: RecordIdString
}

export type MessagesRecord = {
	body: string
	call: RecordIdString
	created: IsoAutoDateString
	id: string
	updated: IsoAutoDateString
	user: RecordIdString
}

export type ParticipantsRecord = {
	call: RecordIdString
	created: IsoAutoDateString
	id: string
	updated: IsoAutoDateString
	user: RecordIdString
}

export const PollOptionsKindOptions = {
	"place": "place",
	"time": "time",
	"other": "other",
} as const
export type PollOptionsKindOptions = typeof PollOptionsKindOptions[keyof typeof PollOptionsKindOptions]
export type PollOptionsRecord = {
	call: RecordIdString
	created: IsoAutoDateString
	id: string
	kind?: PollOptionsKindOptions
	label: string
	updated: IsoAutoDateString
	value?: string
}

export type PollVotesRecord = {
	call: RecordIdString
	created: IsoAutoDateString
	id: string
	option: RecordIdString
	updated: IsoAutoDateString
	user: RecordIdString
}

export const RoomHistoryPrayerOptions = {
	"fajr": "fajr",
	"dhuhr": "dhuhr",
	"asr": "asr",
	"maghrib": "maghrib",
	"isha": "isha",
	"jumuah": "jumuah",
} as const
export type RoomHistoryPrayerOptions = typeof RoomHistoryPrayerOptions[keyof typeof RoomHistoryPrayerOptions]
export type RoomHistoryRecord = {
	created: IsoAutoDateString
	day?: string
	id: string
	joined?: number
	place?: string
	prayer?: RoomHistoryPrayerOptions
	room: RecordIdString
	updated: IsoAutoDateString
}

export type RoomsRecord = {
	code: string
	created: IsoAutoDateString
	default_place?: string
	discoverable?: boolean
	id: string
	lat?: number
	lng?: number
	name: string
	owner: RecordIdString
	tz: string
	updated: IsoAutoDateString
}

export type UsersRecord = {
	avatar?: FileNameString
	avatar_url?: string
	created: IsoAutoDateString
	email: string
	emailVisibility?: boolean
	id: string
	name?: string
	password: string
	sanad_id: string
	tokenKey: string
	updated: IsoAutoDateString
	verified?: boolean
}

// Response types include system fields and match responses from the PocketBase API
export type AuthoriginsResponse<Texpand = unknown> = Required<AuthoriginsRecord> & BaseSystemFields<Texpand>
export type ExternalauthsResponse<Texpand = unknown> = Required<ExternalauthsRecord> & BaseSystemFields<Texpand>
export type MfasResponse<Texpand = unknown> = Required<MfasRecord> & BaseSystemFields<Texpand>
export type OtpsResponse<Texpand = unknown> = Required<OtpsRecord> & BaseSystemFields<Texpand>
export type SuperusersResponse<Texpand = unknown> = Required<SuperusersRecord> & AuthSystemFields<Texpand>
export type CallsResponse<Texpand = unknown> = Required<CallsRecord> & BaseSystemFields<Texpand>
export type MembershipsResponse<Texpand = unknown> = Required<MembershipsRecord> & BaseSystemFields<Texpand>
export type MessagesResponse<Texpand = unknown> = Required<MessagesRecord> & BaseSystemFields<Texpand>
export type ParticipantsResponse<Texpand = unknown> = Required<ParticipantsRecord> & BaseSystemFields<Texpand>
export type PollOptionsResponse<Texpand = unknown> = Required<PollOptionsRecord> & BaseSystemFields<Texpand>
export type PollVotesResponse<Texpand = unknown> = Required<PollVotesRecord> & BaseSystemFields<Texpand>
export type RoomHistoryResponse<Texpand = unknown> = Required<RoomHistoryRecord> & BaseSystemFields<Texpand>
export type RoomsResponse<Texpand = unknown> = Required<RoomsRecord> & BaseSystemFields<Texpand>
export type UsersResponse<Texpand = unknown> = Required<UsersRecord> & AuthSystemFields<Texpand>

// Types containing all Records and Responses, useful for creating typing helper functions

export type CollectionRecords = {
	_authOrigins: AuthoriginsRecord
	_externalAuths: ExternalauthsRecord
	_mfas: MfasRecord
	_otps: OtpsRecord
	_superusers: SuperusersRecord
	calls: CallsRecord
	memberships: MembershipsRecord
	messages: MessagesRecord
	participants: ParticipantsRecord
	poll_options: PollOptionsRecord
	poll_votes: PollVotesRecord
	room_history: RoomHistoryRecord
	rooms: RoomsRecord
	users: UsersRecord
}

export type CollectionResponses = {
	_authOrigins: AuthoriginsResponse
	_externalAuths: ExternalauthsResponse
	_mfas: MfasResponse
	_otps: OtpsResponse
	_superusers: SuperusersResponse
	calls: CallsResponse
	memberships: MembershipsResponse
	messages: MessagesResponse
	participants: ParticipantsResponse
	poll_options: PollOptionsResponse
	poll_votes: PollVotesResponse
	room_history: RoomHistoryResponse
	rooms: RoomsResponse
	users: UsersResponse
}

// Utility types for create/update operations

type ProcessCreateAndUpdateFields<T> = Omit<{
	// Omit AutoDate fields
	[K in keyof T as Extract<T[K], IsoAutoDateString> extends never ? K : never]: 
		// Convert FileNameString to File
		T[K] extends infer U ? 
			U extends (FileNameString | FileNameString[]) ? 
				U extends any[] ? File[] : File 
			: U
		: never
}, 'id'>

// Create type for Auth collections
export type CreateAuth<T> = {
	id?: RecordIdString
	email: string
	emailVisibility?: boolean
	password: string
	passwordConfirm: string
	verified?: boolean
} & ProcessCreateAndUpdateFields<T>

// Create type for Base collections
export type CreateBase<T> = {
	id?: RecordIdString
} & ProcessCreateAndUpdateFields<T>

// Update type for Auth collections
export type UpdateAuth<T> = Partial<
	Omit<ProcessCreateAndUpdateFields<T>, keyof AuthSystemFields>
> & {
	email?: string
	emailVisibility?: boolean
	oldPassword?: string
	password?: string
	passwordConfirm?: string
	verified?: boolean
}

// Update type for Base collections
export type UpdateBase<T> = Partial<
	Omit<ProcessCreateAndUpdateFields<T>, keyof BaseSystemFields>
>

// Get the correct create type for any collection
export type Create<T extends keyof CollectionResponses> =
	CollectionResponses[T] extends AuthSystemFields
		? CreateAuth<CollectionRecords[T]>
		: CreateBase<CollectionRecords[T]>

// Get the correct update type for any collection
export type Update<T extends keyof CollectionResponses> =
	CollectionResponses[T] extends AuthSystemFields
		? UpdateAuth<CollectionRecords[T]>
		: UpdateBase<CollectionRecords[T]>

// Type for usage with type asserted PocketBase instance
// https://github.com/pocketbase/js-sdk#specify-typescript-definitions

export type TypedPocketBase = {
	collection<T extends keyof CollectionResponses>(
		idOrName: T
	): RecordService<CollectionResponses[T]>
} & PocketBase
