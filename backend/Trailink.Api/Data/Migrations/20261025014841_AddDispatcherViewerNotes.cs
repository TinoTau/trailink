using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Trailink.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddDispatcherViewerNotes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "dispatcher_notes",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    dispatcher_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    notes = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_dispatcher_notes", x => x.id);
                    table.ForeignKey(
                        name: "FK_dispatcher_notes_users_dispatcher_user_id",
                        column: x => x.dispatcher_user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_dispatcher_notes_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_dispatcher_notes_dispatcher_user_id_user_id",
                table: "dispatcher_notes",
                columns: new[] { "dispatcher_user_id", "user_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_dispatcher_notes_user_id",
                table: "dispatcher_notes",
                column: "user_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "dispatcher_notes");
        }
    }
}
