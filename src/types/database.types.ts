export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      catalog_imports: {
        Row: {
          applied_at: string
          applied_by: string | null
          file_name: string
          id: string
          summary: Json
        }
        Insert: {
          applied_at?: string
          applied_by?: string | null
          file_name: string
          id?: string
          summary: Json
        }
        Update: {
          applied_at?: string
          applied_by?: string | null
          file_name?: string
          id?: string
          summary?: Json
        }
        Relationships: []
      }
      commercial_policy_sections: {
        Row: {
          content: string
          created_at: string
          display_order: number
          id: string
          is_pending: boolean
          policy_version_id: string
          section_number: string
          title: string
        }
        Insert: {
          content: string
          created_at?: string
          display_order: number
          id?: string
          is_pending?: boolean
          policy_version_id: string
          section_number: string
          title: string
        }
        Update: {
          content?: string
          created_at?: string
          display_order?: number
          id?: string
          is_pending?: boolean
          policy_version_id?: string
          section_number?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "commercial_policy_sections_policy_version_id_fkey"
            columns: ["policy_version_id"]
            isOneToOne: false
            referencedRelation: "commercial_policy_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_policy_versions: {
        Row: {
          approved_at: string | null
          created_at: string
          effective_from: string | null
          effective_until: string | null
          id: string
          status: string
          title: string
          updated_at: string
          version: string
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          status: string
          title: string
          updated_at?: string
          version: string
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          status?: string
          title?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      customer_properties: {
        Row: {
          active: boolean
          city: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          name: string
          notes: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          city?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          name: string
          notes?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          city?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          name?: string
          notes?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_properties_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          active: boolean
          address: Json | null
          created_at: string
          created_by: string | null
          document: string | null
          email: string | null
          id: string
          legacy_code: string | null
          legacy_details: Json | null
          legal_name: string
          notes: string | null
          phone: string | null
          trade_name: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          address?: Json | null
          created_at?: string
          created_by?: string | null
          document?: string | null
          email?: string | null
          id?: string
          legacy_code?: string | null
          legacy_details?: Json | null
          legal_name: string
          notes?: string | null
          phone?: string | null
          trade_name?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          address?: Json | null
          created_at?: string
          created_by?: string | null
          document?: string | null
          email?: string | null
          id?: string
          legacy_code?: string | null
          legacy_details?: Json | null
          legal_name?: string
          notes?: string | null
          phone?: string | null
          trade_name?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      discount_change_log: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          discount_rule_id: string
          id: string
          new_values: Json
          previous_values: Json | null
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          discount_rule_id: string
          id?: string
          new_values: Json
          previous_values?: Json | null
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          discount_rule_id?: string
          id?: string
          new_values?: Json
          previous_values?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "discount_change_log_discount_rule_id_fkey"
            columns: ["discount_rule_id"]
            isOneToOne: false
            referencedRelation: "discount_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_rules: {
        Row: {
          active: boolean
          allows_custom_percentage: boolean
          code: string
          created_at: string
          discount_table_id: string
          display_order: number
          id: string
          name: string
          percentage: number | null
          rule_kind: string
        }
        Insert: {
          active?: boolean
          allows_custom_percentage?: boolean
          code: string
          created_at?: string
          discount_table_id: string
          display_order: number
          id?: string
          name: string
          percentage?: number | null
          rule_kind: string
        }
        Update: {
          active?: boolean
          allows_custom_percentage?: boolean
          code?: string
          created_at?: string
          discount_table_id?: string
          display_order?: number
          id?: string
          name?: string
          percentage?: number | null
          rule_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_rules_discount_table_id_fkey"
            columns: ["discount_table_id"]
            isOneToOne: false
            referencedRelation: "discount_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_tables: {
        Row: {
          code: string
          created_at: string
          effective_from: string
          effective_until: string | null
          id: string
          name: string
          status: string
          updated_at: string
          version: string
        }
        Insert: {
          code: string
          created_at?: string
          effective_from: string
          effective_until?: string | null
          id?: string
          name: string
          status: string
          updated_at?: string
          version: string
        }
        Update: {
          code?: string
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      freight_change_log: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          id: string
          new_values: Json | null
          previous_values: Json | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_values?: Json | null
          previous_values?: Json | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_values?: Json | null
          previous_values?: Json | null
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      freight_rates: {
        Row: {
          amount: number
          bag_weight_kg: number | null
          created_at: string
          freight_zone_id: string
          id: string
          load_type: string
          rate_basis: string
        }
        Insert: {
          amount: number
          bag_weight_kg?: number | null
          created_at?: string
          freight_zone_id: string
          id?: string
          load_type: string
          rate_basis: string
        }
        Update: {
          amount?: number
          bag_weight_kg?: number | null
          created_at?: string
          freight_zone_id?: string
          id?: string
          load_type?: string
          rate_basis?: string
        }
        Relationships: [
          {
            foreignKeyName: "freight_rates_freight_zone_id_fkey"
            columns: ["freight_zone_id"]
            isOneToOne: false
            referencedRelation: "freight_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      freight_tables: {
        Row: {
          code: string
          created_at: string
          effective_from: string
          effective_until: string | null
          id: string
          name: string
          scope_type: string
          status: string
          updated_at: string
          version: string
        }
        Insert: {
          code: string
          created_at?: string
          effective_from: string
          effective_until?: string | null
          id?: string
          name: string
          scope_type: string
          status: string
          updated_at?: string
          version: string
        }
        Update: {
          code?: string
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          id?: string
          name?: string
          scope_type?: string
          status?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      freight_zones: {
        Row: {
          active: boolean
          code: string
          created_at: string
          display_order: number
          freight_table_id: string
          id: string
          label: string
          maximum_distance_km: number | null
          minimum_distance_km: number | null
          minimum_weight_kg: number | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          display_order: number
          freight_table_id: string
          id?: string
          label: string
          maximum_distance_km?: number | null
          minimum_distance_km?: number | null
          minimum_weight_kg?: number | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          display_order?: number
          freight_table_id?: string
          id?: string
          label?: string
          maximum_distance_km?: number | null
          minimum_distance_km?: number | null
          minimum_weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "freight_zones_freight_table_id_fkey"
            columns: ["freight_table_id"]
            isOneToOne: false
            referencedRelation: "freight_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      handling_rate_tables: {
        Row: {
          amount_per_ton: number
          code: string
          created_at: string
          effective_from: string
          effective_until: string | null
          id: string
          name: string
          status: string
          updated_at: string
          version: string
        }
        Insert: {
          amount_per_ton: number
          code: string
          created_at?: string
          effective_from: string
          effective_until?: string | null
          id?: string
          name: string
          status: string
          updated_at?: string
          version: string
        }
        Update: {
          amount_per_ton?: number
          code?: string
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      payment_terms: {
        Row: {
          active: boolean
          average_days: number
          code: string
          created_at: string
          description: string
          display_order: number
          id: string
          label: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          average_days: number
          code: string
          created_at?: string
          description: string
          display_order: number
          id?: string
          label: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          average_days?: number
          code?: string
          created_at?: string
          description?: string
          display_order?: number
          id?: string
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      price_tables: {
        Row: {
          activated_at: string | null
          code: string
          created_at: string
          effective_from: string
          effective_until: string | null
          id: string
          name: string
          notes: string | null
          status: string
          updated_at: string
          version: string
        }
        Insert: {
          activated_at?: string | null
          code: string
          created_at?: string
          effective_from: string
          effective_until?: string | null
          id?: string
          name: string
          notes?: string | null
          status: string
          updated_at?: string
          version: string
        }
        Update: {
          activated_at?: string | null
          code?: string
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          id?: string
          name?: string
          notes?: string | null
          status?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          active: boolean
          code: string
          created_at: string
          display_order: number
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          display_order: number
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_change_log: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_values: Json
          previous_values: Json
          product_id: string
          record_id: string
          table_name: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_values: Json
          previous_values: Json
          product_id: string
          record_id: string
          table_name: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_values?: Json
          previous_values?: Json
          product_id?: string
          record_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_change_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_prices: {
        Row: {
          created_at: string
          id: string
          payment_term_id: string
          price_table_id: string
          product_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          payment_term_id: string
          price_table_id: string
          product_id: string
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          payment_term_id?: string
          price_table_id?: string
          product_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_prices_payment_term_id_fkey"
            columns: ["payment_term_id"]
            isOneToOne: false
            referencedRelation: "payment_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_prices_price_table_id_fkey"
            columns: ["price_table_id"]
            isOneToOne: false
            referencedRelation: "price_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          category_id: string
          code: string
          created_at: string
          display_order: number
          id: string
          name: string
          package_weight_kg: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category_id: string
          code: string
          created_at?: string
          display_order: number
          id?: string
          name: string
          package_weight_kg: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category_id?: string
          code?: string
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          package_weight_kg?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          display_name: string | null
          email: string
          id: string
          login: string
          must_change_password: boolean
          role: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          login: string
          must_change_password?: boolean
          role?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          login?: string
          must_change_password?: boolean
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      quote_items: {
        Row: {
          anticipated_discount_percentage: number
          category_name_snapshot: string | null
          created_at: string
          discount_rule_id: string | null
          display_order: number
          economy_per_unit: number
          final_unit_price: number
          freight_per_unit: number
          freight_subtotal: number
          handling_per_unit: number
          handling_subtotal: number
          id: string
          line_discount_percentage: number
          payment_term_id: string | null
          payment_term_snapshot: string | null
          product_id: string | null
          product_name_snapshot: string
          product_subtotal: number
          quantity: number
          quote_id: string
          table_unit_price: number
          total: number
          total_discount_percentage: number
          weight_kg_snapshot: number
        }
        Insert: {
          anticipated_discount_percentage: number
          category_name_snapshot?: string | null
          created_at?: string
          discount_rule_id?: string | null
          display_order: number
          economy_per_unit: number
          final_unit_price: number
          freight_per_unit: number
          freight_subtotal: number
          handling_per_unit: number
          handling_subtotal: number
          id?: string
          line_discount_percentage: number
          payment_term_id?: string | null
          payment_term_snapshot?: string | null
          product_id?: string | null
          product_name_snapshot: string
          product_subtotal: number
          quantity: number
          quote_id: string
          table_unit_price: number
          total: number
          total_discount_percentage: number
          weight_kg_snapshot: number
        }
        Update: {
          anticipated_discount_percentage?: number
          category_name_snapshot?: string | null
          created_at?: string
          discount_rule_id?: string | null
          display_order?: number
          economy_per_unit?: number
          final_unit_price?: number
          freight_per_unit?: number
          freight_subtotal?: number
          handling_per_unit?: number
          handling_subtotal?: number
          id?: string
          line_discount_percentage?: number
          payment_term_id?: string | null
          payment_term_snapshot?: string | null
          product_id?: string | null
          product_name_snapshot?: string
          product_subtotal?: number
          quantity?: number
          quote_id?: string
          table_unit_price?: number
          total?: number
          total_discount_percentage?: number
          weight_kg_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_discount_rule_id_fkey"
            columns: ["discount_rule_id"]
            isOneToOne: false
            referencedRelation: "discount_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_payment_term_id_fkey"
            columns: ["payment_term_id"]
            isOneToOne: false
            referencedRelation: "payment_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          anticipated_discount_percentage: number
          anticipated_payment: boolean
          approved_at: string | null
          calculation_version: string
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          customer_document_snapshot: string | null
          customer_id: string | null
          customer_name_snapshot: string | null
          discount_table_id: string | null
          economy_total: number
          expires_at: string | null
          freight_table_id: string | null
          freight_table_name_snapshot: string | null
          freight_total: number
          freight_zone_snapshot: string | null
          grand_total: number
          notes: string | null
          payment_mode: string | null
          handling_rate_per_ton_snapshot: number
          handling_rate_table_id: string | null
          handling_total: number
          id: string
          issued_at: string | null
          load_type_snapshot: string | null
          policy_version_id: string | null
          price_table_id: string | null
          product_subtotal: number
          quote_number: number
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          notes?: string | null
          payment_mode?: string | null
          anticipated_discount_percentage?: number
          anticipated_payment?: boolean
          approved_at?: string | null
          calculation_version?: string
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_document_snapshot?: string | null
          customer_id?: string | null
          customer_name_snapshot?: string | null
          discount_table_id?: string | null
          economy_total: number
          expires_at?: string | null
          freight_table_id?: string | null
          freight_table_name_snapshot?: string | null
          freight_total: number
          freight_zone_snapshot?: string | null
          grand_total: number
          handling_rate_per_ton_snapshot?: number
          handling_rate_table_id?: string | null
          handling_total: number
          id?: string
          issued_at?: string | null
          load_type_snapshot?: string | null
          policy_version_id?: string | null
          price_table_id?: string | null
          product_subtotal: number
          quote_number?: never
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          notes?: string | null
          payment_mode?: string | null
          anticipated_discount_percentage?: number
          anticipated_payment?: boolean
          approved_at?: string | null
          calculation_version?: string
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_document_snapshot?: string | null
          customer_id?: string | null
          customer_name_snapshot?: string | null
          discount_table_id?: string | null
          economy_total?: number
          expires_at?: string | null
          freight_table_id?: string | null
          freight_table_name_snapshot?: string | null
          freight_total?: number
          freight_zone_snapshot?: string | null
          grand_total?: number
          handling_rate_per_ton_snapshot?: number
          handling_rate_table_id?: string | null
          handling_total?: number
          id?: string
          issued_at?: string | null
          load_type_snapshot?: string | null
          policy_version_id?: string | null
          price_table_id?: string | null
          product_subtotal?: number
          quote_number?: never
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_discount_table_id_fkey"
            columns: ["discount_table_id"]
            isOneToOne: false
            referencedRelation: "discount_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_freight_table_id_fkey"
            columns: ["freight_table_id"]
            isOneToOne: false
            referencedRelation: "freight_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_handling_rate_table_id_fkey"
            columns: ["handling_rate_table_id"]
            isOneToOne: false
            referencedRelation: "handling_rate_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_policy_version_id_fkey"
            columns: ["policy_version_id"]
            isOneToOne: false
            referencedRelation: "commercial_policy_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_price_table_id_fkey"
            columns: ["price_table_id"]
            isOneToOne: false
            referencedRelation: "price_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      load_items: {
        Row: {
          id: string
          load_id: string
          packing: string
          quantity: number
          quote_id: string
          quote_item_id: string
          stop_order: number
          weight_kg_snapshot: number
        }
        Insert: {
          id?: string
          load_id: string
          packing: string
          quantity: number
          quote_id: string
          quote_item_id: string
          stop_order: number
          weight_kg_snapshot: number
        }
        Update: {
          id?: string
          load_id?: string
          packing?: string
          quantity?: number
          quote_id?: string
          quote_item_id?: string
          stop_order?: number
          weight_kg_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "load_items_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_items_quote_item_id_fkey"
            columns: ["quote_item_id"]
            isOneToOne: false
            referencedRelation: "quote_items"
            referencedColumns: ["id"]
          },
        ]
      }
      loads: {
        Row: {
          cancelled_at: string | null
          capacity_kg_snapshot: number
          created_at: string
          created_by: string | null
          id: string
          load_number: number
          loaded_at: string | null
          notes: string | null
          pallet_count: number
          planned_date: string | null
          shipped_at: string | null
          status: string
          total_weight_kg: number
          updated_at: string
          vehicle_id: string
          vehicle_name_snapshot: string
          vehicle_plate_snapshot: string | null
        }
        Insert: {
          cancelled_at?: string | null
          capacity_kg_snapshot: number
          created_at?: string
          created_by?: string | null
          id?: string
          load_number?: number
          loaded_at?: string | null
          notes?: string | null
          pallet_count?: number
          planned_date?: string | null
          shipped_at?: string | null
          status?: string
          total_weight_kg?: number
          updated_at?: string
          vehicle_id: string
          vehicle_name_snapshot: string
          vehicle_plate_snapshot?: string | null
        }
        Update: {
          cancelled_at?: string | null
          capacity_kg_snapshot?: number
          created_at?: string
          created_by?: string | null
          id?: string
          load_number?: number
          loaded_at?: string | null
          notes?: string | null
          pallet_count?: number
          planned_date?: string | null
          shipped_at?: string | null
          status?: string
          total_weight_kg?: number
          updated_at?: string
          vehicle_id?: string
          vehicle_name_snapshot?: string
          vehicle_plate_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loads_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      pallet_settings: {
        Row: {
          bags_per_pallet: Json
          id: boolean
          pallet_weight_kg: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bags_per_pallet?: Json
          id?: boolean
          pallet_weight_kg?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bags_per_pallet?: Json
          id?: boolean
          pallet_weight_kg?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          active: boolean
          body_height_cm: number | null
          body_length_cm: number | null
          body_width_cm: number | null
          capacity_kg: number
          created_at: string
          id: string
          name: string
          plate: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          body_height_cm?: number | null
          body_length_cm?: number | null
          body_width_cm?: number | null
          capacity_kg: number
          created_at?: string
          id?: string
          name: string
          plate?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          body_height_cm?: number | null
          body_length_cm?: number | null
          body_width_cm?: number | null
          capacity_kg?: number
          created_at?: string
          id?: string
          name?: string
          plate?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      visits: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          developed: string | null
          follow_up_of: string | null
          id: string
          next_action: string | null
          not_done_note: string | null
          not_done_reason: string | null
          property_id: string | null
          quote_id: string | null
          scheduled_date: string | null
          seller_id: string
          status: string
          updated_at: string
          updated_by: string | null
          visit_types: string[]
          visited_date: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          developed?: string | null
          follow_up_of?: string | null
          id?: string
          next_action?: string | null
          not_done_note?: string | null
          not_done_reason?: string | null
          property_id?: string | null
          quote_id?: string | null
          scheduled_date?: string | null
          seller_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          visit_types?: string[]
          visited_date?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          developed?: string | null
          follow_up_of?: string | null
          id?: string
          next_action?: string | null
          not_done_note?: string | null
          not_done_reason?: string | null
          property_id?: string | null
          quote_id?: string | null
          scheduled_date?: string | null
          seller_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          visit_types?: string[]
          visited_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_follow_up_of_fkey"
            columns: ["follow_up_of"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "customer_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_catalog_update: { Args: { p_payload: Json }; Returns: Json }
      can_manage_sales: { Args: never; Returns: boolean }
      create_quote: {
        Args: { p_items: Json; p_quote: Json }
        Returns: {
          id: string
          quote_number: number
        }[]
      }
      current_profile_role: { Args: never; Returns: string }
      deactivate_discount_rule: {
        Args: { p_rule_id: string }
        Returns: undefined
      }
      deactivate_freight_zone: {
        Args: { p_zone_id: string }
        Returns: undefined
      }
      deactivate_product: { Args: { p_product_id: string }; Returns: undefined }
      is_admin: { Args: never; Returns: boolean }
      list_sellers: {
        Args: never
        Returns: {
          id: string
          name: string
          role: string
        }[]
      }
      normalize_customer_document: {
        Args: { p_document: string }
        Returns: string
      }
      quote_seller_name: { Args: { p_quote_id: string }; Returns: string }
      sales_report: { Args: { p_from: string; p_to: string }; Returns: Json }
      sales_report_data: {
        Args: {
          p_from: string
          p_include_sellers: boolean
          p_seller_id: string
          p_to: string
        }
        Returns: Json
      }
      save_discount_rule: {
        Args: { p_name: string; p_percentage: number; p_rule_id: string | null }
        Returns: string
      }
      save_freight_zone: {
        Args: {
          p_label: string
          p_rates: Json
          p_table_code: string
          p_zone_id: string | null
        }
        Returns: string
      }
      save_handling_rate: {
        Args: { p_amount_per_ton: number }
        Returns: undefined
      }
      set_freight_rate: {
        Args: {
          p_amount: number
          p_bag_weight: number
          p_basis: string
          p_load_type: string
          p_zone_id: string
        }
        Returns: undefined
      }
      deactivate_vehicle: { Args: { p_vehicle_id: string }; Returns: undefined }
      load_candidates: {
        Args: { p_load_id?: string | null }
        Returns: {
          allocated: number
          approved_at: string | null
          customer_id: string | null
          customer_name: string | null
          display_order: number
          in_this_load: number
          product_name: string
          quantity: number
          quote_id: string
          quote_item_id: string
          quote_number: number
          weight_kg: number
        }[]
      }
      quote_shipping: {
        Args: { p_quote_ids: string[] }
        Returns: { planned_bags: number; quote_id: string; shipped_bags: number; total_bags: number }[]
      }
      save_load: {
        Args: { p_items: Json; p_load: Json; p_load_id: string | null }
        Returns: { id: string; load_number: number }[]
      }
      save_pallet_settings: {
        Args: { p_bags_per_pallet: Json; p_pallet_weight_kg: number | null }
        Returns: undefined
      }
      save_vehicle: { Args: { p_vehicle: Json; p_vehicle_id: string | null }; Returns: string }
      set_load_status: { Args: { p_load_id: string; p_status: string }; Returns: undefined }
      set_quote_status: {
        Args: { p_quote_id: string; p_status: string }
        Returns: undefined
      }
      update_product: {
        Args: {
          p_name: string
          p_package_weight_kg: number
          p_prices: Json
          p_product_id: string
        }
        Returns: undefined
      }
      update_quote: {
        Args: { p_items: Json; p_quote: Json; p_quote_id: string }
        Returns: {
          id: string
          quote_number: number
        }[]
      }
      visits_report: {
        Args: { p_from: string; p_stale_days?: number; p_to: string }
        Returns: Json
      }
      visits_report_data: {
        Args: {
          p_from: string
          p_include_sellers: boolean
          p_seller_id: string
          p_stale_days: number
          p_to: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
