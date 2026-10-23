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
            entity.HasIndex(x => x.OrderNo).IsUnique();
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
