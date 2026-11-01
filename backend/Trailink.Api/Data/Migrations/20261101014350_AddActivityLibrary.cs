using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Trailink.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddActivityLibrary : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "library_activity_id",
                table: "order_activities",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "destinations",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name_zh = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                    name_en = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    mark = table.Column<string>(type: "character varying(4)", maxLength: 4, nullable: true),
                    created_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_destinations", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "library_activities",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name_zh = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    name_en = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    shared_notes = table.Column<string>(type: "text", nullable: true),
                    created_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_library_activities", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "library_activity_destinations",
                columns: table => new
                {
                    activity_id = table.Column<Guid>(type: "uuid", nullable: false),
                    destination_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_library_activity_destinations", x => new { x.activity_id, x.destination_id });
                    table.ForeignKey(
                        name: "FK_library_activity_destinations_destinations_destination_id",
                        column: x => x.destination_id,
                        principalTable: "destinations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_library_activity_destinations_library_activities_activity_id",
                        column: x => x.activity_id,
                        principalTable: "library_activities",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "library_activity_photos",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    activity_id = table.Column<Guid>(type: "uuid", nullable: false),
                    file_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    file_path = table.Column<string>(type: "text", nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_library_activity_photos", x => x.id);
                    table.ForeignKey(
                        name: "FK_library_activity_photos_library_activities_activity_id",
                        column: x => x.activity_id,
                        principalTable: "library_activities",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "library_activity_ratings",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    activity_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    score = table.Column<int>(type: "integer", nullable: false),
                    comment = table.Column<string>(type: "text", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_library_activity_ratings", x => x.id);
                    table.CheckConstraint("ck_library_activity_ratings_score", "score BETWEEN 1 AND 5");
                    table.ForeignKey(
                        name: "FK_library_activity_ratings_library_activities_activity_id",
                        column: x => x.activity_id,
                        principalTable: "library_activities",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_library_activity_ratings_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "user_activity_orders",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    destination_id = table.Column<Guid>(type: "uuid", nullable: false),
                    activity_id = table.Column<Guid>(type: "uuid", nullable: false),
                    position = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_activity_orders", x => new { x.user_id, x.destination_id, x.activity_id });
                    table.ForeignKey(
                        name: "FK_user_activity_orders_destinations_destination_id",
                        column: x => x.destination_id,
                        principalTable: "destinations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_user_activity_orders_library_activities_activity_id",
                        column: x => x.activity_id,
                        principalTable: "library_activities",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_user_activity_orders_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                table: "destinations",
                columns: new[] { "id", "created_at", "created_by_user_id", "mark", "name_en", "name_zh" },
                values: new object[,]
                {
                    { new Guid("6c1f0001-0000-4000-8000-000000000001"), new DateTimeOffset(new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, "基", "Christchurch", "基督城" },
                    { new Guid("6c1f0001-0000-4000-8000-000000000002"), new DateTimeOffset(new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, "凯", "Kaikoura", "凯库拉" },
                    { new Guid("6c1f0001-0000-4000-8000-000000000003"), new DateTimeOffset(new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, "特", "Lake Tekapo", "特卡波" },
                    { new Guid("6c1f0001-0000-4000-8000-000000000004"), new DateTimeOffset(new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, "瓦", "Wanaka", "瓦纳卡" },
                    { new Guid("6c1f0001-0000-4000-8000-000000000005"), new DateTimeOffset(new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, "皇", "Queenstown", "皇后镇" },
                    { new Guid("6c1f0001-0000-4000-8000-000000000006"), new DateTimeOffset(new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, "蒂", "Te Anau", "蒂阿瑙" },
                    { new Guid("6c1f0001-0000-4000-8000-000000000007"), new DateTimeOffset(new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, "但", "Dunedin", "但尼丁" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_order_activities_library_activity_id",
                table: "order_activities",
                column: "library_activity_id");

            migrationBuilder.CreateIndex(
                name: "IX_destinations_mark",
                table: "destinations",
                column: "mark",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_library_activity_destinations_destination_id",
                table: "library_activity_destinations",
                column: "destination_id");

            migrationBuilder.CreateIndex(
                name: "IX_library_activity_photos_activity_id",
                table: "library_activity_photos",
                column: "activity_id");

            migrationBuilder.CreateIndex(
                name: "IX_library_activity_ratings_activity_id_user_id",
                table: "library_activity_ratings",
                columns: new[] { "activity_id", "user_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_library_activity_ratings_user_id",
                table: "library_activity_ratings",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "IX_user_activity_orders_activity_id",
                table: "user_activity_orders",
                column: "activity_id");

            migrationBuilder.CreateIndex(
                name: "IX_user_activity_orders_destination_id",
                table: "user_activity_orders",
                column: "destination_id");

            migrationBuilder.AddForeignKey(
                name: "FK_order_activities_library_activities_library_activity_id",
                table: "order_activities",
                column: "library_activity_id",
                principalTable: "library_activities",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_order_activities_library_activities_library_activity_id",
                table: "order_activities");

            migrationBuilder.DropTable(
                name: "library_activity_destinations");

            migrationBuilder.DropTable(
                name: "library_activity_photos");

            migrationBuilder.DropTable(
                name: "library_activity_ratings");

            migrationBuilder.DropTable(
                name: "user_activity_orders");

            migrationBuilder.DropTable(
                name: "destinations");

            migrationBuilder.DropTable(
                name: "library_activities");

            migrationBuilder.DropIndex(
                name: "IX_order_activities_library_activity_id",
                table: "order_activities");

            migrationBuilder.DropColumn(
                name: "library_activity_id",
                table: "order_activities");
        }
    }
}
