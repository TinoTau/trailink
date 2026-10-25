using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Trailink.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddUserAssignedColor : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "assigned_color",
                table: "users",
                type: "character varying(7)",
                maxLength: 7,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "assigned_color",
                table: "users");
        }
    }
}
