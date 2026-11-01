using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Trailink.Api.Data.Migrations
{
    /// <summary>
    /// 订单相关表的增量备份支持，全部在数据库里完成，后端代码和 EF 模型不用改：
    /// <list type="bullet">
    /// <item>orders、itinerary_days、order_activities、order_files、order_notes 新增 updated_at，
    /// 新增行取当前时间，修改时由触发器自动更新（包括后端的原生 SQL 写入）。已有行取迁移执行的时间。</item>
    /// <item>新增 backup_deletions：上述表删除一行时，由触发器记下表名、主键和删除时间，增量备份据此还原删除。</item>
    /// </list>
    /// 只新增列、表、触发器，不改动已有数据。
    /// </summary>
    public partial class AddBackupChangeTracking : Migration
    {
        private static readonly string[] Tables = ["orders", "itinerary_days", "order_activities", "order_files", "order_notes"];

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                CREATE TABLE IF NOT EXISTS backup_deletions (
                    id bigserial PRIMARY KEY,
                    table_name text NOT NULL,
                    row_id uuid NOT NULL,
                    deleted_at timestamptz NOT NULL DEFAULT now()
                );
                CREATE INDEX IF NOT EXISTS ix_backup_deletions_deleted_at ON backup_deletions (deleted_at);

                CREATE OR REPLACE FUNCTION backup_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    NEW.updated_at := now();
                    RETURN NEW;
                END $$;

                CREATE OR REPLACE FUNCTION backup_record_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    INSERT INTO backup_deletions (table_name, row_id) VALUES (TG_TABLE_NAME, OLD.id);
                    RETURN OLD;
                END $$;
                """);

            foreach (var table in Tables)
            {
                migrationBuilder.Sql($"""
                    ALTER TABLE {table} ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
                    CREATE INDEX IF NOT EXISTS ix_{table}_updated_at ON {table} (updated_at);
                    DROP TRIGGER IF EXISTS {table}_backup_touch ON {table};
                    CREATE TRIGGER {table}_backup_touch BEFORE UPDATE ON {table}
                        FOR EACH ROW EXECUTE FUNCTION backup_touch_updated_at();
                    DROP TRIGGER IF EXISTS {table}_backup_deletion ON {table};
                    CREATE TRIGGER {table}_backup_deletion AFTER DELETE ON {table}
                        FOR EACH ROW EXECUTE FUNCTION backup_record_deletion();
                    """);
            }
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            foreach (var table in Tables)
            {
                migrationBuilder.Sql($"""
                    DROP TRIGGER IF EXISTS {table}_backup_deletion ON {table};
                    DROP TRIGGER IF EXISTS {table}_backup_touch ON {table};
                    DROP INDEX IF EXISTS ix_{table}_updated_at;
                    ALTER TABLE {table} DROP COLUMN IF EXISTS updated_at;
                    """);
            }

            migrationBuilder.Sql("""
                DROP FUNCTION IF EXISTS backup_record_deletion();
                DROP FUNCTION IF EXISTS backup_touch_updated_at();
                DROP TABLE IF EXISTS backup_deletions;
                """);
        }
    }
}
