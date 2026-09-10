export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      activities: {
        Row: {
          activity_type: string;
          available_at: string;
          comment_count: number;
          created_at: string;
          creator_user_id: string | null;
          duration_minutes: number | null;
          id: string;
          is_demo: boolean;
          message: string;
          response_count: number;
          score: number;
          status: string;
        };
        Insert: {
          activity_type: string;
          available_at: string;
          comment_count?: number;
          created_at?: string;
          creator_user_id?: string | null;
          duration_minutes?: number | null;
          id?: string;
          is_demo?: boolean;
          message: string;
          response_count?: number;
          score?: number;
          status?: string;
        };
        Update: {
          activity_type?: string;
          available_at?: string;
          comment_count?: number;
          created_at?: string;
          creator_user_id?: string | null;
          duration_minutes?: number | null;
          id?: string;
          is_demo?: boolean;
          message?: string;
          response_count?: number;
          score?: number;
          status?: string;
        };
        Relationships: [];
      };
      activity_comments: {
        Row: {
          activity_id: string;
          author_user_id: string | null;
          body: string;
          created_at: string;
          id: string;
          is_anonymous: boolean;
          score: number;
          status: string;
          updated_at: string;
        };
        Insert: {
          activity_id: string;
          author_user_id?: string | null;
          body: string;
          created_at?: string;
          id?: string;
          is_anonymous?: boolean;
          score?: number;
          status?: string;
          updated_at?: string;
        };
        Update: {
          activity_id?: string;
          author_user_id?: string | null;
          body?: string;
          created_at?: string;
          id?: string;
          is_anonymous?: boolean;
          score?: number;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activity_comments_activity_id_fkey";
            columns: ["activity_id"];
            isOneToOne: false;
            referencedRelation: "activities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_comments_activity_id_fkey";
            columns: ["activity_id"];
            isOneToOne: false;
            referencedRelation: "public_activities";
            referencedColumns: ["id"];
          },
        ];
      };
      activity_responses: {
        Row: {
          activity_id: string;
          created_at: string;
          user_id: string;
        };
        Insert: {
          activity_id: string;
          created_at?: string;
          user_id: string;
        };
        Update: {
          activity_id?: string;
          created_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activity_responses_activity_id_fkey";
            columns: ["activity_id"];
            isOneToOne: false;
            referencedRelation: "activities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_responses_activity_id_fkey";
            columns: ["activity_id"];
            isOneToOne: false;
            referencedRelation: "public_activities";
            referencedColumns: ["id"];
          },
        ];
      };
      activity_votes: {
        Row: {
          activity_id: string;
          created_at: string;
          user_id: string;
          value: number;
        };
        Insert: {
          activity_id: string;
          created_at?: string;
          user_id: string;
          value: number;
        };
        Update: {
          activity_id?: string;
          created_at?: string;
          user_id?: string;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "activity_votes_activity_id_fkey";
            columns: ["activity_id"];
            isOneToOne: false;
            referencedRelation: "activities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_votes_activity_id_fkey";
            columns: ["activity_id"];
            isOneToOne: false;
            referencedRelation: "public_activities";
            referencedColumns: ["id"];
          },
        ];
      };
      call_sessions: {
        Row: {
          callee_id: string;
          caller_id: string;
          conversation_id: string;
          created_at: string;
          ended_at: string | null;
          id: string;
          status: string;
        };
        Insert: {
          callee_id: string;
          caller_id: string;
          conversation_id: string;
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          status?: string;
        };
        Update: {
          callee_id?: string;
          caller_id?: string;
          conversation_id?: string;
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "call_sessions_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          description: string | null;
          emoji: string | null;
          id: string;
          name: string;
          slug: string;
          sort_order: number;
        };
        Insert: {
          description?: string | null;
          emoji?: string | null;
          id?: string;
          name: string;
          slug: string;
          sort_order?: number;
        };
        Update: {
          description?: string | null;
          emoji?: string | null;
          id?: string;
          name?: string;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      college_highlights: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          emoji: string;
          ends_at: string | null;
          expires_at: string | null;
          id: string;
          image_url: string | null;
          is_active: boolean;
          link_url: string | null;
          priority: number;
          starts_at: string | null;
          title: string;
          updated_at: string;
          video_url: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          emoji?: string;
          ends_at?: string | null;
          expires_at?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          link_url?: string | null;
          priority?: number;
          starts_at?: string | null;
          title: string;
          updated_at?: string;
          video_url?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          emoji?: string;
          ends_at?: string | null;
          expires_at?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          link_url?: string | null;
          priority?: number;
          starts_at?: string | null;
          title?: string;
          updated_at?: string;
          video_url?: string | null;
        };
        Relationships: [];
      };
      comment_votes: {
        Row: {
          comment_id: string;
          created_at: string;
          user_id: string;
          value: number;
        };
        Insert: {
          comment_id: string;
          created_at?: string;
          user_id: string;
          value: number;
        };
        Update: {
          comment_id?: string;
          created_at?: string;
          user_id?: string;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "comment_votes_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comment_votes_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "public_comments";
            referencedColumns: ["id"];
          },
        ];
      };
      comments: {
        Row: {
          author_user_id: string | null;
          body: string;
          created_at: string;
          id: string;
          is_anonymous: boolean;
          parent_id: string | null;
          post_id: string;
          score: number;
          status: string;
          updated_at: string;
        };
        Insert: {
          author_user_id?: string | null;
          body: string;
          created_at?: string;
          id?: string;
          is_anonymous?: boolean;
          parent_id?: string | null;
          post_id: string;
          score?: number;
          status?: string;
          updated_at?: string;
        };
        Update: {
          author_user_id?: string | null;
          body?: string;
          created_at?: string;
          id?: string;
          is_anonymous?: boolean;
          parent_id?: string | null;
          post_id?: string;
          score?: number;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "public_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "public_posts";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_members: {
        Row: {
          conversation_id: string;
          joined_at: string;
          last_read_at: string | null;
          user_id: string;
        };
        Insert: {
          conversation_id: string;
          joined_at?: string;
          last_read_at?: string | null;
          user_id: string;
        };
        Update: {
          conversation_id?: string;
          joined_at?: string;
          last_read_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          created_at: string;
          id: string;
          participant_a: string | null;
          participant_b: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          participant_a?: string | null;
          participant_b?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          participant_a?: string | null;
          participant_b?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      mentions: {
        Row: {
          created_at: string;
          id: string;
          mentioned_user_id: string;
          source_id: string;
          source_type: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          mentioned_user_id: string;
          source_id: string;
          source_type: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          mentioned_user_id?: string;
          source_id?: string;
          source_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mentions_mentioned_user_id_fkey";
            columns: ["mentioned_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mentions_mentioned_user_id_fkey";
            columns: ["mentioned_user_id"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          attachment_name: string | null;
          attachment_size: number | null;
          attachment_type: string | null;
          attachment_url: string | null;
          content: string | null;
          conversation_id: string;
          created_at: string;
          deleted_at: string | null;
          duration_ms: number | null;
          edited_at: string | null;
          id: string;
          message_type: string;
          parent_id: string | null;
          sender_id: string;
          updated_at: string;
          voice_duration: number | null;
        };
        Insert: {
          attachment_name?: string | null;
          attachment_size?: number | null;
          attachment_type?: string | null;
          attachment_url?: string | null;
          content?: string | null;
          conversation_id: string;
          created_at?: string;
          deleted_at?: string | null;
          duration_ms?: number | null;
          edited_at?: string | null;
          id?: string;
          message_type?: string;
          parent_id?: string | null;
          sender_id: string;
          updated_at?: string;
          voice_duration?: number | null;
        };
        Update: {
          attachment_name?: string | null;
          attachment_size?: number | null;
          attachment_type?: string | null;
          attachment_url?: string | null;
          content?: string | null;
          conversation_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          duration_ms?: number | null;
          edited_at?: string | null;
          id?: string;
          message_type?: string;
          parent_id?: string | null;
          sender_id?: string;
          updated_at?: string;
          voice_duration?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          actor_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          message: string | null;
          read: boolean;
          type: string;
          user_id: string;
        };
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          message?: string | null;
          read?: boolean;
          type: string;
          user_id: string;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          message?: string | null;
          read?: boolean;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "auth.users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "auth.users";
            referencedColumns: ["id"];
          },
        ];
      };
      post_votes: {
        Row: {
          created_at: string;
          post_id: string;
          user_id: string;
          value: number;
        };
        Insert: {
          created_at?: string;
          post_id: string;
          user_id: string;
          value: number;
        };
        Update: {
          created_at?: string;
          post_id?: string;
          user_id?: string;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "post_votes_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_votes_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "public_posts";
            referencedColumns: ["id"];
          },
        ];
      };
      posts: {
        Row: {
          author_user_id: string | null;
          body: string | null;
          category_id: string;
          comment_count: number;
          created_at: string;
          id: string;
          image_url: string | null;
          is_anonymous: boolean;
          is_demo: boolean;
          score: number;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          author_user_id?: string | null;
          body?: string | null;
          category_id: string;
          comment_count?: number;
          created_at?: string;
          id?: string;
          image_url?: string | null;
          is_anonymous?: boolean;
          is_demo?: boolean;
          score?: number;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          author_user_id?: string | null;
          body?: string | null;
          category_id?: string;
          comment_count?: number;
          created_at?: string;
          id?: string;
          image_url?: string | null;
          is_anonymous?: boolean;
          is_demo?: boolean;
          score?: number;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "posts_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          reputation: number;
          updated_at: string;
          username: string;
          username_confirmed: boolean;
          verification_reason: string | null;
          verification_status: string;
          verified_at: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          reputation?: number;
          updated_at?: string;
          username: string;
          username_confirmed?: boolean;
          verification_reason?: string | null;
          verification_status?: string;
          verified_at?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          reputation?: number;
          updated_at?: string;
          username?: string;
          username_confirmed?: boolean;
          verification_reason?: string | null;
          verification_status?: string;
          verified_at?: string | null;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          created_at: string;
          details: string | null;
          id: string;
          reason: string;
          reporter_user_id: string;
          status: string;
          target_id: string;
          target_type: string;
        };
        Insert: {
          created_at?: string;
          details?: string | null;
          id?: string;
          reason: string;
          reporter_user_id: string;
          status?: string;
          target_id: string;
          target_type: string;
        };
        Update: {
          created_at?: string;
          details?: string | null;
          id?: string;
          reason?: string;
          reporter_user_id?: string;
          status?: string;
          target_id?: string;
          target_type?: string;
        };
        Relationships: [];
      };
      reserved_usernames: {
        Row: {
          name: string;
        };
        Insert: {
          name: string;
        };
        Update: {
          name?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      verification_requests: {
        Row: {
          claimed_by: string | null;
          created_at: string;
          id: string;
          message: string | null;
          mod_note: string | null;
          proof_url: string | null;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          claimed_by?: string | null;
          created_at?: string;
          id?: string;
          message?: string | null;
          mod_note?: string | null;
          proof_url?: string | null;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          claimed_by?: string | null;
          created_at?: string;
          id?: string;
          message?: string | null;
          mod_note?: string | null;
          proof_url?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      voice_calls: {
        Row: {
          call_type: string;
          callee_id: string;
          caller_id: string;
          conversation_id: string;
          created_at: string;
          ended_at: string | null;
          id: string;
          started_at: string | null;
          status: string;
          token: string;
        };
        Insert: {
          call_type?: string;
          callee_id: string;
          caller_id: string;
          conversation_id: string;
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          started_at?: string | null;
          status?: string;
          token: string;
        };
        Update: {
          call_type?: string;
          callee_id?: string;
          caller_id?: string;
          conversation_id?: string;
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          started_at?: string | null;
          status?: string;
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: "voice_calls_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      public_activities: {
        Row: {
          activity_type: string | null;
          available_at: string | null;
          comment_count: number | null;
          created_at: string | null;
          creator_avatar_url: string | null;
          creator_id: string | null;
          creator_username: string | null;
          creator_verified: boolean | null;
          duration_minutes: number | null;
          id: string | null;
          is_demo: boolean | null;
          message: string | null;
          response_count: number | null;
          score: number | null;
        };
        Relationships: [];
      };
      public_activity_comments: {
        Row: {
          activity_id: string | null;
          author_avatar_url: string | null;
          author_id: string | null;
          author_username: string | null;
          author_verified: boolean | null;
          body: string | null;
          created_at: string | null;
          id: string | null;
          is_anonymous: boolean | null;
          is_owner: boolean | null;
          score: number | null;
          updated_at: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "activity_comments_activity_id_fkey";
            columns: ["activity_id"];
            isOneToOne: false;
            referencedRelation: "activities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_comments_activity_id_fkey";
            columns: ["activity_id"];
            isOneToOne: false;
            referencedRelation: "public_activities";
            referencedColumns: ["id"];
          },
        ];
      };
      public_comments: {
        Row: {
          author_avatar_url: string | null;
          author_id: string | null;
          author_username: string | null;
          author_verified: boolean | null;
          body: string | null;
          created_at: string | null;
          id: string | null;
          is_anonymous: boolean | null;
          is_owner: boolean | null;
          parent_id: string | null;
          post_id: string | null;
          score: number | null;
          updated_at: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "public_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "public_posts";
            referencedColumns: ["id"];
          },
        ];
      };
      public_posts: {
        Row: {
          author_avatar_url: string | null;
          author_id: string | null;
          author_username: string | null;
          author_verified: boolean | null;
          body: string | null;
          category_emoji: string | null;
          category_id: string | null;
          category_name: string | null;
          category_slug: string | null;
          comment_count: number | null;
          created_at: string | null;
          id: string | null;
          image_url: string | null;
          is_anonymous: boolean | null;
          is_demo: boolean | null;
          is_owner: boolean | null;
          score: number | null;
          title: string | null;
          updated_at: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "posts_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      public_profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          created_at: string | null;
          display_name: string | null;
          id: string | null;
          is_admin: boolean | null;
          is_moderator: boolean | null;
          reputation: number | null;
          username: string | null;
          username_confirmed: boolean | null;
          verification_status: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string | null;
          display_name?: string | null;
          id?: string | null;
          is_admin?: boolean | null;
          is_moderator?: boolean | null;
          reputation?: number | null;
          username?: string | null;
          username_confirmed?: boolean | null;
          verification_status?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string | null;
          display_name?: string | null;
          id?: string | null;
          reputation?: number | null;
          username?: string | null;
          username_confirmed?: boolean | null;
          verification_status?: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      can_access_chat_attachment: { Args: { _name: string }; Returns: boolean };
      can_access_verification_file: {
        Args: { _name: string };
        Returns: boolean;
      };
      can_participate_verification_chat: {
        Args: { _request_id: string };
        Returns: boolean;
      };
      can_upload_chat_attachment: { Args: { _name: string }; Returns: boolean };
      can_upload_verification_file: { Args: { _name: string }; Returns: boolean };
      can_view_post_image: { Args: { _path: string }; Returns: boolean };
      chat_attachments_folder_member: {
        Args: { _name: string };
        Returns: boolean;
      };
      chat_conversation_summaries: {
        Args: never;
        Returns: {
          conversation_id: string;
          last_message: string;
          last_message_at: string;
          last_message_type: string;
          other_avatar_url: string;
          other_display_name: string;
          other_user_id: string;
          other_username: string;
          other_verified: boolean;
          unread_count: number;
          updated_at: string;
        }[];
      };
      claim_verification_request: {
        Args: { _request_id: string };
        Returns: undefined;
      };
      ensure_direct_conversation: {
        Args: { _peer_id: string };
        Returns: string;
      };
      get_chat_attachment_url: { Args: { _path: string }; Returns: string };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_allowed_chat_file: { Args: { _name: string }; Returns: boolean };
      is_conversation_member: {
        Args: { _conversation_id: string };
        Returns: boolean;
      };
      is_moderator: { Args: { _user_id: string }; Returns: boolean };
      is_verified_student:
        { Args: never; Returns: boolean } | { Args: { _user_id: string }; Returns: boolean };
      list_activities: {
        Args: { _activity_type?: string; _limit?: number };
        Returns: {
          activity_type: string | null;
          available_at: string | null;
          comment_count: number | null;
          created_at: string | null;
          creator_avatar_url: string | null;
          creator_id: string | null;
          creator_username: string | null;
          creator_verified: boolean | null;
          duration_minutes: number | null;
          id: string | null;
          is_demo: boolean | null;
          message: string | null;
          response_count: number | null;
          score: number | null;
        }[];
      };
      list_activity_comments: {
        Args: { _activity_id: string };
        Returns: {
          activity_id: string | null;
          author_avatar_url: string | null;
          author_id: string | null;
          author_username: string | null;
          author_verified: boolean | null;
          body: string | null;
          created_at: string | null;
          id: string | null;
          is_anonymous: boolean | null;
          is_owner: boolean | null;
          score: number | null;
          updated_at: string | null;
        }[];
      };
      list_verification_chat_messages: {
        Args: { _request_id: string };
        Returns: {
          attachment_name: string | null;
          attachment_size: number | null;
          attachment_type: string | null;
          attachment_url: string | null;
          content: string | null;
          created_at: string;
          id: string;
          message_type: string;
          request_id: string;
          sender_id: string;
        }[];
      };
      moderation_queue: {
        Args: never;
        Returns: {
          content_body: string;
          content_status: string;
          content_title: string;
          created_at: string;
          details: string;
          reason: string;
          report_id: string;
          status: string;
          target_id: string;
          target_type: string;
        }[];
      };
      open_verification_chat: {
        Args: { _request_id: string };
        Returns: undefined;
      };
      recount_post_comments: { Args: { _post_id: string }; Returns: undefined };
      resolve_verification_request: {
        Args: { _approved: boolean; _mod_note?: string; _request_id: string };
        Returns: undefined;
      };
      search_profiles: {
        Args: { _limit?: number; _q: string };
        Returns: {
          avatar_url: string;
          bio: string;
          display_name: string;
          id: string;
          reputation: number;
          username: string;
          verification_status: string;
        }[];
      };
      send_verification_chat_message: {
        Args: {
          _attachment_name?: string;
          _attachment_size?: number;
          _attachment_type?: string;
          _attachment_url?: string;
          _content?: string;
          _request_id: string;
        };
        Returns: undefined;
      };
      set_my_username: { Args: { _username: string }; Returns: string };
      set_verification_status: {
        Args: { _reason?: string; _status: string; _user_id: string };
        Returns: undefined;
      };
      submit_verification_request: {
        Args: { _message?: string; _proof_url?: string };
        Returns: Json;
      };
      suggest_usernames: { Args: { _base: string }; Returns: string[] };
      unclaim_verification_request: {
        Args: { _request_id: string };
        Returns: undefined;
      };
      update_my_profile: {
        Args: { _avatar_url?: string; _bio?: string; _display_name?: string };
        Returns: undefined;
      };
      username_available: { Args: { _username: string }; Returns: boolean };
      vote_activity: {
        Args: { _activity_id: string; _value: number };
        Returns: {
          score: number;
          user_vote: number;
        }[];
      };
      vote_comment: {
        Args: { _comment_id: string; _value: number };
        Returns: {
          score: number;
          user_vote: number;
        }[];
      };
      vote_post: {
        Args: { _post_id: string; _value: number };
        Returns: {
          score: number;
          user_vote: number;
        }[];
      };
    };
    Enums: {
      app_role: "admin" | "moderator" | "user";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const;
