using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Trailink.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AdjustOrderStructure : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_orders_date_range",
                table: "orders");

            migrationBuilder.DropCheckConstraint(
                name: "ck_orders_status",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "end_date",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "status",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "title",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "notes",
                table: "itinerary_days");

            migrationBuilder.DropColumn(
                name: "start_time",
                table: "itinerary_days");

            migrationBuilder.RenameColumn(
                name: "source",
                table: "orders",
                newName: "source_company");

            migrationBuilder.AddColumn<int>(
                name: "guest_count",
                table: "orders",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "order_no",
                table: "orders",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "platform_order_no",
                table: "orders",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.Sql("""
                UPDATE orders
                SET order_no = 'TL-' || to_char(start_date, 'YYYYMMDD') || '-' || upper(substr(replace(id::text, '-', ''), 1, 6))
                WHERE order_no IS NULL OR order_no = '';
                """);

            migrationBuilder.AddColumn<string>(
                name: "end_location",
                table: "itinerary_days",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "order_activities",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    itinerary_day_id = table.Column<Guid>(type: "uuid", nullable: false),
                    content = table.Column<string>(type: "text", nullable: false),
                    provider = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    booking_time = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    checkin_time = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ticket_path = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_order_activities", x => x.id);
                    table.ForeignKey(
                        name: "FK_order_activities_itinerary_days_itinerary_day_id",
                        column: x => x.itinerary_day_id,
                        principalTable: "itinerary_days",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_orders_order_no",
                table: "orders",
                column: "order_no",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_order_activities_itinerary_day_id",
                table: "order_activities",
                column: "itinerary_day_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "order_activities");

            migrationBuilder.DropIndex(
                name: "IX_orders_order_no",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "guest_count",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "order_no",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "platform_order_no",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "end_location",
                table: "itinerary_days");

            migrationBuilder.RenameColumn(
                name: "source_company",
                table: "orders",
                newName: "source");

            migrationBuilder.AddColumn<DateOnly>(
                name: "end_date",
                table: "orders",
                type: "date",
                nullable: false,
                defaultValue: new DateOnly(1, 1, 1));

            migrationBuilder.AddColumn<string>(
                name: "status",
                table: "orders",
                type: "character varying(30)",
                maxLength: 30,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "title",
                table: "orders",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "notes",
                table: "itinerary_days",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<TimeOnly>(
                name: "start_time",
                table: "itinerary_days",
                type: "time without time zone",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_orders_date_range",
                table: "orders",
                sql: "end_date >= start_date");

            migrationBuilder.AddCheckConstraint(
                name: "ck_orders_status",
                table: "orders",
                sql: "status IN ('not_started', 'in_progress', 'completed', 'cancelled')");
        }
    }
}
