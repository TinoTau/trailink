using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Trailink.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderViewerNotes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "order_notes",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    order_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    notes = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_order_notes", x => x.id);
                    table.ForeignKey(
                        name: "FK_order_notes_orders_order_id",
                        column: x => x.order_id,
                        principalTable: "orders",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_order_notes_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_order_notes_order_id_user_id",
                table: "order_notes",
                columns: new[] { "order_id", "user_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_order_notes_user_id",
                table: "order_notes",
                column: "user_id");

            migrationBuilder.Sql("""
                INSERT INTO order_notes (id, order_id, user_id, notes)
                SELECT gen_random_uuid(), o.id, o.created_by_user_id, btrim(o.notes)
                FROM orders o
                WHERE o.created_by_user_id IS NOT NULL
                  AND o.notes IS NOT NULL
                  AND btrim(o.notes) <> '';
                """);

            migrationBuilder.DropColumn(
                name: "notes",
                table: "orders");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "order_notes");

            migrationBuilder.AddColumn<string>(
                name: "notes",
                table: "orders",
                type: "text",
                nullable: true);
        }
    }
}
