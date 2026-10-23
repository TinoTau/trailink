using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Trailink.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class UseLocalActivityTimes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM order_activities
                        WHERE booking_time IS NOT NULL OR checkin_time IS NOT NULL
                    ) THEN
                        RAISE EXCEPTION
                            'Refusing to convert non-null activity times from timestamptz without confirmed local values.';
                    END IF;
                END $$;
                """);

            migrationBuilder.Sql("""
                ALTER TABLE order_activities
                    ALTER COLUMN booking_time TYPE timestamp without time zone
                        USING NULL::timestamp without time zone,
                    ALTER COLUMN checkin_time TYPE timestamp without time zone
                        USING NULL::timestamp without time zone;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<DateTimeOffset>(
                name: "checkin_time",
                table: "order_activities",
                type: "timestamp with time zone",
                nullable: true,
                oldClrType: typeof(DateTime),
                oldType: "timestamp without time zone",
                oldNullable: true);

            migrationBuilder.AlterColumn<DateTimeOffset>(
                name: "booking_time",
                table: "order_activities",
                type: "timestamp with time zone",
                nullable: true,
                oldClrType: typeof(DateTime),
                oldType: "timestamp without time zone",
                oldNullable: true);
        }
    }
}
