using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Trailink.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddItineraryDayAssignedBy : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "assigned_by_user_id",
                table: "itinerary_days",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_itinerary_days_assigned_by_user_id",
                table: "itinerary_days",
                column: "assigned_by_user_id");

            migrationBuilder.AddForeignKey(
                name: "FK_itinerary_days_users_assigned_by_user_id",
                table: "itinerary_days",
                column: "assigned_by_user_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.Sql("""
                UPDATE itinerary_days AS day
                SET assigned_by_user_id = orders.created_by_user_id
                FROM orders
                WHERE day.order_id = orders.id
                  AND day.driver_id IS NOT NULL
                  AND day.assigned_by_user_id IS NULL
                  AND orders.created_by_user_id IS NOT NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_itinerary_days_users_assigned_by_user_id",
                table: "itinerary_days");

            migrationBuilder.DropIndex(
                name: "IX_itinerary_days_assigned_by_user_id",
                table: "itinerary_days");

            migrationBuilder.DropColumn(
                name: "assigned_by_user_id",
                table: "itinerary_days");
        }
    }
}
