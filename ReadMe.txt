cd C:\dev\calect
cd C:\dev\calect-mobile


リスト表示
& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -list-avds


エミュレータ起動
& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -avd Pixel_6a_API_35

& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -avd Medium_Phone_API_36.0


Metro開発サーバー起動
npx react-native start --reset-cache


ビルドしてアプリ起動
npx react-native run-android


アンインストール
adb uninstall com.calect
# その後、ビルド＆再インストール
npx react-native run-android

cd android
./gradlew clean assembleRelease
cd ..

アプリ内ファイル一覧
adb shell run-as com.calect ls -R



/src
  /features
    /calendar
      /screens
        CalendarScreen.tsx
      /ui
        CalendarParts.tsx       // WeekHeader等を吸収した軽量UI集約
      /components
        DayCell.tsx
        DayEventsSheet.tsx      // or EventModal.tsx のどちらか
        LeftDrawer.tsx          // ProfileDrawer統合済
        DebugHUD.tsx            // __DEV__のみ
      index.ts                  // 再エクスポート集約（下にサンプル）
  /store                        // 共有データ層（機能横断）
    db.ts
    monthShard.ts
    localFile.ts
    filePaths.ts
    sync.ts
    syncQueue.ts
    storage.ts                  // appData.tsの役割もここに集約
  /types
    localTypes.ts
  /app                          // アプリ全体の共通
    bootstrap.ts
    // （任意）utils/logger.ts, utils/result.ts, ui/tokens.ts など

JSON形式

ハッシュ値は更新用

{
  "version": 2,
  "profile": {
    "current_user_id": "{ログインユーザID}",
    "default_tz": "{ユーザのタイムゾーン 例: Asia/Tokyo}",
    "locale": "{ユーザの国・地域 例: ja-JP}",
    "profile_image_path": "{プロフィール画像URLまたはパス}",
    "username": "{本名などの企業向けの名前}",
    "username_url": "{一意なURL用の名前 例: taro-yamada｜制約: 正規表現 ^[a-z0-9-]{3,32}$ }",
    "display_name": "{外部公開用の表示名}",
    "email": "{メールアドレス}",
    "updated_at": "{更新日時 例: 2025-10-01T00:00:00Z}"
  },
  "sync": {
    "hashes": {
      "document": "{更新用ハッシュ値}",
      "profile": "{更新用ハッシュ値}",
      "tombstones": "{更新用ハッシュ値}",
      "organizations": "{更新用ハッシュ値}",
      "follows": "{更新用ハッシュ値}",
      "groups": "{更新用ハッシュ値}",
      "org_relationships": "{更新用ハッシュ値}",
      "calendars": "{更新用ハッシュ値}",
      "events": "{更新用ハッシュ値}",
      "push_reminders": "{更新用ハッシュ値}",
      "event_tags": "{更新用ハッシュ値}",
      "plans": "{更新用ハッシュ値}",
      "subscriptions": "{更新用ハッシュ値}"
    }
  },
  "tombstones": {
    "organizations": ["{削除した組織ID}"],
    "follows": ["{削除したフォローID}"],
    "groups": ["{削除したグループID}"],
    "org_relationships": ["{削除した所属関係ID}"],
    "calendars": ["{削除したカレンダーID}"],
    "events": ["{削除したイベントID}"],
    "push_reminders": ["{削除したリマインダID}"],
    "event_tags": ["{削除したタグID}"],
    "subscriptions": ["{削除したサブスクリプションID}"],
    "plans": ["{削除したプランコード}"],
    "updated_at": "{更新日時 例: 2025-10-01T00:00:00Z}"
  },
  "entities": {
    "organizations": {
      "{組織ID}": {
        "org_id": "{組織ID}",
        "name": "{組織名}",
        "plan": "{契約IDまたはプランコード 例: free|pro|enterprise}",
        "locale": "{国・地域 例: ja-JP}",
        "tz": "{タイムゾーン 例: Asia/Tokyo}"
      }
    },
    "follows": {
      "{フォローユーザID}": {
        "user_id": "{フォローユーザID}",
        "display_name": "{フォローユーザ名}",
        "profile_image_path": "{プロフィール画像URLまたはパス}"
      }
    },
    "groups": {
      "{所属グループID}": {
        "group_id": "{所属グループID}",
        "owner_org_id": "{グループ所有組織ID}",
        "owner_user_id": "{グループ所有者ユーザIDまたはnull}",
        "name": "{グループ名}",
        "members": {
          "{メンバーのユーザID}": {
            "user_id": "{メンバーのユーザID}",
            "name": "{グループ内表示名}",
            "role": "{役割 例: owner|member|admin}",
            "can_share": "{true/false}",
            "can_invite": "{true/false}"
          }
        },
        "updated_at": "{更新日時 例: 2025-10-02T00:00:00Z}"
      }
    },
    "org_relationships": [
      {
        "org_id": "{ログインユーザーが所属する組織ID}",
        "role": "{owner|member|admin}",
        "can_invite": "{true/false}",
        "can_share": "{true/false}",
        "updated_at": "{更新日時 例: 2025-10-02T00:00:00Z}"
      }
    ],
    "calendars": {
      "{カレンダーID}": {
        "calendar_id": "{カレンダーID}",
        "owner_user_id": "{カレンダー所有者ユーザIDまたはnull}",
        "owner_group_id": "{カレンダー所有グループIDまたはnull}",
        "name": "{カレンダー名}",
        "color": "{カラーHEX 例: #2563EB}",
        "calendar_shares": [
          {
            "user_id": "{共有対象ユーザIDまたはnull}",
            "group_id": "{共有対象グループIDまたはnull}",
            "content_visibility": "{公開範囲 例: busy|full|summary}"
          }
        ],
        "updated_at": "{更新日時 例: 2025-10-03T00:00:00Z}",
        "deleted_at": "{削除日時またはnull}"
      }
    },
    "events": {
      "{イベントID}": {
        "event_id": "{イベントID}",
        "calendar_id": "{イベント所有カレンダーID}",
        "title": "{タイトル}",
        "summary": "{詳細説明}",
        "start_at": "{開始時刻 HH:mm 例: 09:30}",
        "end_at": "{終了時刻 HH:mm 例: 10:30}",
        "event_shares": [
          {
            "user_id": "{共有対象ユーザIDまたはnull}",
            "group_id": "{共有対象グループIDまたはnull}",
            "content_visibility": "{公開範囲 例: busy|full|summary}"
          }
        ],
        "followers_share": "{true/false}",
        "link_token": "{イベント共有用トークンまたはnull｜推奨: 推測困難なBase62(22–32桁)｜短期TTL運用}",
        "priority": "{優先度 例: low|normal|high}",
        "recurrence": {
          "rrule": "{RFC5545 RRULE 例: FREQ=WEEKLY;BYDAY=MO,WE,FR}",
          "dtstart": "{基準日時（TZ必須） 例: 2025-10-08T09:30:00+09:00}",
          "exdates": ["{除外日時(ISO8601) 例: 2025-10-13T09:30:00+09:00}"],
          "rdates": ["{追加発生日時(ISO8601) 例: 2025-10-20T09:30:00+09:00}"],
          "until": "{終了日時(ISO8601)またはnull 例: 2025-12-31T23:59:59Z}"
        },
        "overrides": [
          {
            "occurrence_date": "{上書き対象日 例: 2025-10-15}",
            "cancelled": "{true/false｜trueの場合、他フィールドは無視}",
            "title": "{上書きタイトル}",
            "summary": "{上書き説明}",
            "start_at": "{上書き開始時刻 HH:mm}",
            "end_at": "{上書き終了時刻 HH:mm}",
            "priority": "{上書き優先度 例: low|normal|high}"
          }
        ],
        "tags": [
          { "tag_id": "{タグID}" }
        ],
        "updated_by": "{更新者ユーザID}",
        "updated_at": "{更新日時 例: 2025-10-07T15:00:00Z}"
      }
    },
    "push_reminders": [
      {
        "reminder_id": "{通知ID}",
        "event_id": "{イベントID}",
        "absolute_at": "{通知日時(ISO8601) 例: 2025-10-08T09:15:00+09:00}",
        "updated_at": "{更新日時 例: 2025-10-07T15:05:00Z}"
      }
    ],
    "event_tags": {
      "{タグID}": {
        "tag_id": "{タグID}",
        "name": "{タグ名 例: 重要}",
        "updated_at": "{更新日時 例: 2025-10-08T01:05:00Z}"
      }
    },
    "plans": {
      "{プランコード 例: free}": {
        "plan_code": "{プランコード 例: free}",
        "name": "{プラン名 例: Free}",
        "summary": "{説明またはnull}",
        "max_group_members_per_group": "{数値 例: 10}",
        "max_groups_per_owner": "{数値 例: 3}",
        "max_calendars_per_owner": "{数値 例: 3}",
        "price_monthly_cents": "{数値 例: 0}",
        "currency": "{通貨コード 例: JPY}",
        "updated_at": "{更新日時 例: 2025-10-01T00:00:00Z}"
      }
    },
    "subscriptions": {
      "{サブスクリプションID}": {
        "sub_id": "{サブスクリプションID}",
        "org_id": "{対象組織ID}",
        "user_id": "{対象ユーザIDまたはnull}",
        "plan_code": "{プランコード 例: free}",
        "status": "{状態 例: active|canceled|past_due}",
        "trial_end": "{トライアル終了日時またはnull}",
        "current_period_start": "{課金期間開始 例: 2025-10-01}",
        "current_period_end": "{課金期間終了 例: 2025-11-01}",
        "updated_at": "{更新日時 例: 2025-10-01T00:00:00Z}"
      }
    }
  }
}











{
  "version": 1,
  "meta": {
    "schema": "{スキーマ名 例: client_prefs.v1}",
    "updated_at": "{更新日時 例: 2025-10-08T00:00:00Z}",
    "app_version": "{アプリ版数 例: 0.1.0}",
    "device_id": "{デバイス識別子 例: android-pixel-6a}"
  },

  "users": {
    "nicknames": {
      "{ユーザID_1 例: 01UAAAAAAAAAAAAAAAAAAAAAAA}": "{ニックネーム 例: たろう}",
      "{ユーザID_2 例: 01UBBBBBBBBBBBBBBBBBBBBBBBB}": "{ニックネーム 例: はなこちゃん}"
    }
  },

  "calendars": {
    "{カレンダーID_1 例: 01CALAAAAAAAAAAAAAAAAAAAAAA}": {
      "background_image": "{ローカル画像URI 例: file:///storage/emulated/0/Android/data/com.calect/files/covers/personal.jpg}",
      "icon_image_path": "file:///storage/emulated/0/.../icons/personal.png",
      "event_style_default": {
        "font_family": "{フォント名 例: NotoSansJP}",
        "font_color": "{HEXカラー 例: #111827}",
        "background_color": "{HEXカラー 例: #EEF2FF}",
        "border_color": "{HEXカラー 例: #6366F1}"
      },
      "overlays": [
        {
          "calendar_id": "{重ねる元カレンダーID 例: 01CALBBBBBBBBBBBBBBBBBBBBBB}",
          "event_filters": {
            "tags_include": ["{タグID 例: 01TAGAAAAAAAAAAAAAAAAAAAAAA}"],
            "tags_exclude": [],
            "priority_min": "{low|normal|high 例: low}"
          }
        },
        {
          "calendar_id": "{別の重ねる元カレンダーID 例: 01CALCCCCCCCCCCCCCCCCCCCCCC}",
          "event_filters": {
            "tags_include": [],
            "tags_exclude": ["{タグID 例: 01TAGEXCLUDEXXXXXXXXXXXXX}"],
            "priority_min": "{low|normal|high 例: normal}"
          }
        }
      ]
    },

    "{カレンダーID_2 例: 01CALBBBBBBBBBBBBBBBBBBBBBB}": {
      "background_image": "{コンテントURI 例: content://com.calect.fileprovider/my_images/covers/team-green.png}",
      "icon_image_path": "https://example.com/assets/icons/team.png",
      "event_style_default": {
        "font_family": "{フォント名 例: Inter}",
        "font_color": "{HEXカラー 例: #052E16}",
        "background_color": "{HEXカラー 例: #DCFCE7}",
        "border_color": "{HEXカラー 例: #16A34A}"
      },
      "overlays": [
        {
          "calendar_id": "{重ねる元カレンダーID 例: 01CALAAAAAAAAAAAAAAAAAAAAAA}",
          "event_filters": {
            "tags_include": [],
            "tags_exclude": [],
            "priority_min": "{low|normal|high 例: low}"
          }
        }
      ]
    }
  },

  "events": {
    "style_overrides": {
      "{イベントID_1 例: 01EVTAAAAAAAAAAAAAAAAAAAAAA}": {
        "font_family": "{フォント名 例: NotoSansJP}",
        "font_color": "{HEXカラー 例: #0F172A}",
        "background_color": "{HEXカラー 例: #E2E8F0}",
        "border_color": "{HEXカラー 例: #334155}"
      },
      "{イベントID_2 例: 01EVTBBBBBBBBBBBBBBBBBBBBBB}": {
        "font_family": "{フォント名 例: Inter}",
        "font_color": "{HEXカラー 例: #052E16}",
        "background_color": "{HEXカラー 例: #DCFCE7}",
        "border_color": "{HEXカラー 例: #16A34A}"
      }
    },
    "notifications": {
      "{イベントID_1 例: 01EVTAAAAAAAAAAAAAAAAAAAAAA}": [
        {
          "type": "{通知タイプ 例: offset|absolute}",
          "at": "{absolute用 ISO8601 例: 2025-10-08T08:45:00+09:00}",
          "offset_minutes": "{offset用 分 例: 15}",
          "channel": "{通知チャネル名 例: reminders}",
          "allow_override": "{true/false}"
        }
      ],
      "{イベントID_2 例: 01EVTBBBBBBBBBBBBBBBBBBBBBB}": [
        {
          "type": "{通知タイプ 例: offset}",
          "offset_minutes": "{分 例: 30}",
          "channel": "{通知チャネル名 例: default}",
          "allow_override": "{true/false}"
        }
      ]
    }
  },

  "notifications": {
    "channels": {
      "default": {
        "importance": "{default|low|min|high}",
        "sound": "{default|none|custom_uri}",
        "vibrate": "{true/false}"
      },
      "reminders": {
        "importance": "{high}",
        "sound": "{default}",
        "vibrate": "{true/false}"
      },
      "silent": {
        "importance": "{low}",
        "sound": "{none}",
        "vibrate": "{true/false}"
      }
    },
    "requires_exact_alarm": "{true/false}",
    "ignore_battery_optimizations_hint": "{true/false}",
    "reschedule_after_boot": "{true/false}"
  },

  "sync": {
    "auto_on_app_start": "{true/false}",
    "auto_on_foreground": "{true/false}",
    "periodic_minutes": "{同期間隔(分) 例: 60}",
    "network": {
      "wifi_only": "{true/false}",
      "allow_roaming": "{true/false}"
    },
    "conflict_policy": "{last_write_wins|client_wins|server_wins}"
  },

  "storage": {
    "cache": {
      "max_mb": "{最大キャッシュ(MB) 例: 128}",
      "avatar_ttl_hours": "{アバターTTL(時間) 例: 168}",
      "bg_image_ttl_hours": "{背景TTL(時間) 例: 720}"
    },
    "backup": {
      "allow_os_backup": "{true/false}"
    }
  },

  "display": {
    "theme": "{light|dark|system}",
    "week_start": "{mon|sun}",
    "show_holidays": "{true/false}",
    "show_week_numbers": "{true/false}",
    "time_format": "{24h|12h}",
    "tz_follow_device": "{true/false}"
  },

  "accessibility": {
    "max_font_scale": "{最大フォント倍率 例: 1.3}",
    "high_contrast": "{true/false}",
    "reduce_motion": "{true/false}"
  },

  "privacy": {
    "redaction_level": "{none|title_only|busy_only}"
  },

  "security": {
    "app_lock": {
      "enabled": "{true/false}",
      "method": "{biometric|pin|pattern}",
      "auto_lock_seconds": "{自動ロック秒 例: 120}"
    }
  },

  "logging": {
    "send_crash_reports": "{true/false}",
    "log_level": "{error|warn|info|debug}"
  },

  "features": {
    "follows": "{true/false}",
    "tags": "{true/false}",
    "experimental": {
      "agenda_compact_mode": "{true/false}"
    }
  }
}
