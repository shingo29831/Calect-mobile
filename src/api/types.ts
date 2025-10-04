export type ULID = string; // CHAR(26)


export type Calendar = {
calendar_id: ULID;
name: string;
tz: string;
color?: string | null;
visibility: 'private'|'org'|'public';
};


export type Event = {
event_id: ULID;
calendar_id: ULID;
title: string;
description?: string | null;
is_all_day: boolean;
tz: string;
start_at: string; // ISO
end_at: string; // ISO
visibility: 'inherit'|'private'|'org'|'public'|'link';
};


export type EventInstance = {
instance_id: number;
calendar_id: ULID;
event_id: ULID;
title: string;
start_at: string; // ISO
end_at: string; // ISO
};