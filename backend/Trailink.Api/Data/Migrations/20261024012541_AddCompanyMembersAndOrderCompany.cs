using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Trailink.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCompanyMembersAndOrderCompany : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_dispatcher_applications_user_id",
                table: "dispatcher_applications");

            migrationBuilder.AddColumn<Guid>(
                name: "company_id",
                table: "orders",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "created_by_user_id",
                table: "orders",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "contact",
                table: "companies",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "qr_path",
                table: "companies",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "company_members",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    company_id = table.Column<Guid>(type: "uuid", nullable: false),
                    role = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_company_members", x => x.id);
                    table.ForeignKey(
                        name: "FK_company_members_companies_company_id",
                        column: x => x.company_id,
                        principalTable: "companies",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_company_members_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_orders_company_id",
                table: "orders",
                column: "company_id");

            migrationBuilder.CreateIndex(
                name: "IX_orders_created_by_user_id",
                table: "orders",
                column: "created_by_user_id");

            migrationBuilder.CreateIndex(
                name: "IX_dispatcher_applications_user_id_company_id",
                table: "dispatcher_applications",
                columns: new[] { "user_id", "company_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_company_members_company_id",
                table: "company_members",
                column: "company_id");

            migrationBuilder.CreateIndex(
                name: "IX_company_members_user_id_company_id",
                table: "company_members",
                columns: new[] { "user_id", "company_id" },
                unique: true);

            migrationBuilder.Sql("""
                INSERT INTO company_members (id, user_id, company_id, role)
                SELECT gen_random_uuid(), id, company_id, 'dispatcher'
                FROM users
                WHERE role = 'dispatcher' AND company_id IS NOT NULL;

                UPDATE users
                SET company_id = NULL
                WHERE role = 'dispatcher';
                """);

            migrationBuilder.AddForeignKey(
                name: "FK_orders_companies_company_id",
                table: "orders",
                column: "company_id",
                principalTable: "companies",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_orders_users_created_by_user_id",
                table: "orders",
                column: "created_by_user_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_orders_companies_company_id",
                table: "orders");

            migrationBuilder.DropForeignKey(
                name: "FK_orders_users_created_by_user_id",
                table: "orders");

            migrationBuilder.DropTable(
                name: "company_members");

            migrationBuilder.DropIndex(
                name: "IX_orders_company_id",
                table: "orders");

            migrationBuilder.DropIndex(
                name: "IX_orders_created_by_user_id",
                table: "orders");

            migrationBuilder.DropIndex(
                name: "IX_dispatcher_applications_user_id_company_id",
                table: "dispatcher_applications");

            migrationBuilder.DropColumn(
                name: "company_id",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "created_by_user_id",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "contact",
                table: "companies");

            migrationBuilder.DropColumn(
                name: "qr_path",
                table: "companies");

            migrationBuilder.CreateIndex(
                name: "IX_dispatcher_applications_user_id",
                table: "dispatcher_applications",
                column: "user_id",
                unique: true);
        }
    }
}
