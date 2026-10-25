using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Trailink.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderAssignedDispatcher : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "assigned_dispatcher_user_id",
                table: "orders",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_orders_assigned_dispatcher_user_id",
                table: "orders",
                column: "assigned_dispatcher_user_id");

            migrationBuilder.AddForeignKey(
                name: "FK_orders_users_assigned_dispatcher_user_id",
                table: "orders",
                column: "assigned_dispatcher_user_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.Sql("""
                UPDATE orders o
                SET assigned_dispatcher_user_id = o.created_by_user_id
                FROM users u
                WHERE o.created_by_user_id = u.id
                  AND u.role = 'dispatcher'
                  AND o.assigned_dispatcher_user_id IS NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_orders_users_assigned_dispatcher_user_id",
                table: "orders");

            migrationBuilder.DropIndex(
                name: "IX_orders_assigned_dispatcher_user_id",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "assigned_dispatcher_user_id",
                table: "orders");
        }
    }
}
