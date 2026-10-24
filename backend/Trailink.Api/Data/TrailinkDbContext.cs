using Microsoft.EntityFrameworkCore;
using Trailink.Api.Models;

namespace Trailink.Api.Data;

public class TrailinkDbContext(DbContextOptions<TrailinkDbContext> options) : DbContext(options)
{
    public DbSet<Driver> Drivers => Set<Driver>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<ItineraryDay> ItineraryDays => Set<ItineraryDay>();
    public DbSet<OrderActivity> OrderActivities => Set<OrderActivity>();
    public DbSet<OrderFile> OrderFiles => Set<OrderFile>();
    public DbSet<Company> Companies => Set<Company>();
    public DbSet<User> Users => Set<User>();
    public DbSet<CompanyMember> CompanyMembers => Set<CompanyMember>();
    public DbSet<DispatcherApplication> DispatcherApplications => Set<DispatcherApplication>();
    public DbSet<DriverApplication> DriverApplications => Set<DriverApplication>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Driver>(entity =>
        {
            entity.ToTable("drivers");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.Name).HasColumnName("name").HasMaxLength(100).IsRequired();
            entity.Property(x => x.Phone).HasColumnName("phone").HasMaxLength(50);
            entity.Property(x => x.Notes).HasColumnName("notes");
        });

        modelBuilder.Entity<Company>(entity =>
        {
            entity.ToTable("companies");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.Name).HasColumnName("name").HasMaxLength(200).IsRequired();
            entity.Property(x => x.Contact).HasColumnName("contact").HasMaxLength(200);
            entity.Property(x => x.QrPath).HasColumnName("qr_path").HasMaxLength(500);
            entity.HasIndex(x => x.Name).IsUnique();
        });

        modelBuilder.Entity<CompanyMember>(entity =>
        {
            entity.ToTable("company_members");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.UserId).HasColumnName("user_id");
            entity.Property(x => x.CompanyId).HasColumnName("company_id");
            entity.Property(x => x.Role).HasColumnName("role").HasMaxLength(20).IsRequired();
            entity.HasIndex(x => new { x.UserId, x.CompanyId }).IsUnique();

            entity.HasOne(x => x.User)
                .WithMany(x => x.Memberships)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.Company)
                .WithMany(x => x.Members)
                .HasForeignKey(x => x.CompanyId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("users");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.Username).HasColumnName("username").HasMaxLength(50).IsRequired();
            entity.Property(x => x.PasswordHash).HasColumnName("password_hash").HasMaxLength(200).IsRequired();
            entity.Property(x => x.Name).HasColumnName("name").HasMaxLength(100).IsRequired();
            entity.Property(x => x.Role).HasColumnName("role").HasMaxLength(20).IsRequired();
            entity.Property(x => x.CompanyId).HasColumnName("company_id");
            entity.Property(x => x.DriverId).HasColumnName("driver_id");
            entity.Property(x => x.AvatarPath).HasColumnName("avatar_path").HasMaxLength(500);
            entity.HasIndex(x => x.Username).IsUnique();

            entity.HasOne(x => x.Company)
                .WithMany(x => x.Users)
                .HasForeignKey(x => x.CompanyId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(x => x.Driver)
                .WithMany()
                .HasForeignKey(x => x.DriverId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<DispatcherApplication>(entity =>
        {
            entity.ToTable("dispatcher_applications");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.UserId).HasColumnName("user_id");
            entity.Property(x => x.CompanyId).HasColumnName("company_id");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.HasIndex(x => new { x.UserId, x.CompanyId }).IsUnique();

            entity.HasOne(x => x.User)
                .WithMany(x => x.Applications)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.Company)
                .WithMany(x => x.Applications)
                .HasForeignKey(x => x.CompanyId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<DriverApplication>(entity =>
        {
            entity.ToTable("driver_applications");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.UserId).HasColumnName("user_id");
            entity.Property(x => x.DispatcherUserId).HasColumnName("dispatcher_user_id");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.HasIndex(x => new { x.UserId, x.DispatcherUserId }).IsUnique();

            entity.HasOne(x => x.User)
                .WithMany(x => x.DriverApplications)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.Dispatcher)
                .WithMany(x => x.IncomingDriverApplications)
                .HasForeignKey(x => x.DispatcherUserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Order>(entity =>
        {
            entity.ToTable("orders");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.OrderNo).HasColumnName("order_no").HasMaxLength(40).IsRequired();
            entity.Property(x => x.PlatformOrderNo).HasColumnName("platform_order_no").HasMaxLength(100);
            entity.Property(x => x.SourceCompany).HasColumnName("source_company").HasMaxLength(200);
            entity.Property(x => x.StartDate).HasColumnName("start_date");
            entity.Property(x => x.GuestCount).HasColumnName("guest_count");
            entity.Property(x => x.Notes).HasColumnName("notes");
            entity.Property(x => x.CompanyId).HasColumnName("company_id");
            entity.Property(x => x.CreatedByUserId).HasColumnName("created_by_user_id");
            entity.HasIndex(x => x.OrderNo).IsUnique();

            entity.HasOne(x => x.Company)
                .WithMany()
                .HasForeignKey(x => x.CompanyId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(x => x.CreatedBy)
                .WithMany()
                .HasForeignKey(x => x.CreatedByUserId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<ItineraryDay>(entity =>
        {
            entity.ToTable("itinerary_days");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.OrderId).HasColumnName("order_id");
            entity.Property(x => x.ServiceDate).HasColumnName("service_date");
            entity.Property(x => x.Description).HasColumnName("description");
            entity.Property(x => x.EndLocation).HasColumnName("end_location").HasMaxLength(200);
            entity.Property(x => x.DriverId).HasColumnName("driver_id");
            entity.HasIndex(x => new { x.OrderId, x.ServiceDate }).IsUnique();

            entity.HasOne(x => x.Order)
                .WithMany(x => x.Days)
                .HasForeignKey(x => x.OrderId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.Driver)
                .WithMany(x => x.ItineraryDays)
                .HasForeignKey(x => x.DriverId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<OrderActivity>(entity =>
        {
            entity.ToTable("order_activities");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.ItineraryDayId).HasColumnName("itinerary_day_id");
            entity.Property(x => x.Content).HasColumnName("content").IsRequired();
            entity.Property(x => x.Provider).HasColumnName("provider").HasMaxLength(200);
            entity.Property(x => x.BookingTime).HasColumnName("booking_time").HasColumnType("timestamp without time zone");
            entity.Property(x => x.CheckinTime).HasColumnName("checkin_time").HasColumnType("timestamp without time zone");
            entity.Property(x => x.TicketPath).HasColumnName("ticket_path");
            entity.Property(x => x.SortOrder).HasColumnName("sort_order");

            entity.HasOne(x => x.ItineraryDay)
                .WithMany(x => x.Activities)
                .HasForeignKey(x => x.ItineraryDayId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<OrderFile>(entity =>
        {
            entity.ToTable("order_files");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.OrderId).HasColumnName("order_id");
            entity.Property(x => x.FileName).HasColumnName("file_name").HasMaxLength(255).IsRequired();
            entity.Property(x => x.FilePath).HasColumnName("file_path").IsRequired();

            entity.HasOne(x => x.Order)
                .WithMany(x => x.Files)
                .HasForeignKey(x => x.OrderId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
