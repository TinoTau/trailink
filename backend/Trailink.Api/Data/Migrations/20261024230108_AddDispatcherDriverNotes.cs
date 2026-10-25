using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Trailink.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddDispatcherDriverNotes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "driver_notes",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    driver_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    notes = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_driver_notes", x => x.id);
                    table.ForeignKey(
                        name: "FK_driver_notes_drivers_driver_id",
                        column: x => x.driver_id,
                        principalTable: "drivers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_driver_notes_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_driver_notes_driver_id_user_id",
                table: "driver_notes",
                columns: new[] { "driver_id", "user_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_driver_notes_user_id",
                table: "driver_notes",
                column: "user_id");

            migrationBuilder.Sql("""
                INSERT INTO driver_notes (id, driver_id, user_id, notes)
                SELECT gen_random_uuid(), d.id, u.id, btrim(d.notes)
                FROM drivers d
                JOIN users u ON u.username = 'lin'
                WHERE d.notes IS NOT NULL AND btrim(d.notes) <> '';
                """);

            migrationBuilder.DropColumn(
                name: "notes",
                table: "drivers");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "driver_notes");

            migrationBuilder.AddColumn<string>(
                name: "notes",
                table: "drivers",
                type: "text",
                nullable: true);
        }
    }
}
