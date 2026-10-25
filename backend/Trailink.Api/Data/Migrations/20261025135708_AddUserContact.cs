using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Trailink.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddUserContact : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "contact",
                table: "users",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "contact",
                table: "users");
        }
    }
}
