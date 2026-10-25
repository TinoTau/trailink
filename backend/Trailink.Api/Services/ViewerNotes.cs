using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.Models;

namespace Trailink.Api.Services;

public static class ViewerNotes
{
    public static Task UpsertDriverAsync(
        TrailinkDbContext db,
        Guid driverId,
        Guid userId,
        string? notes,
        CancellationToken cancellationToken)
    {
        var own = db.DriverNotes.Where(note => note.DriverId == driverId && note.UserId == userId);
        return UpsertAsync(
            own,
            notes,
            trimmed => db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO driver_notes (id, driver_id, user_id, notes, hidden)
                VALUES ({Guid.NewGuid()}, {driverId}, {userId}, {trimmed}, false)
                ON CONFLICT (driver_id, user_id) DO UPDATE SET notes = EXCLUDED.notes
                """, cancellationToken),
            cancellationToken);
    }

    public static Task SetDriverHiddenAsync(
        TrailinkDbContext db,
        Guid driverId,
        Guid userId,
        bool hidden,
        CancellationToken cancellationToken)
    {
        var own = db.DriverNotes.Where(note => note.DriverId == driverId && note.UserId == userId);
        return SetHiddenAsync(
            own,
            hidden,
            () => db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO driver_notes (id, driver_id, user_id, notes, hidden)
                VALUES ({Guid.NewGuid()}, {driverId}, {userId}, '', true)
                ON CONFLICT (driver_id, user_id) DO UPDATE SET hidden = true
                """, cancellationToken),
            cancellationToken);
    }

    public static Task UpsertDispatcherAsync(
        TrailinkDbContext db,
        Guid dispatcherUserId,
        Guid userId,
        string? notes,
        CancellationToken cancellationToken)
    {
        var own = db.DispatcherNotes.Where(note => note.DispatcherUserId == dispatcherUserId && note.UserId == userId);
        return UpsertAsync(
            own,
            notes,
            trimmed => db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO dispatcher_notes (id, dispatcher_user_id, user_id, notes, hidden)
                VALUES ({Guid.NewGuid()}, {dispatcherUserId}, {userId}, {trimmed}, false)
                ON CONFLICT (dispatcher_user_id, user_id) DO UPDATE SET notes = EXCLUDED.notes
                """, cancellationToken),
            cancellationToken);
    }

    public static Task SetDispatcherHiddenAsync(
        TrailinkDbContext db,
        Guid dispatcherUserId,
        Guid userId,
        bool hidden,
        CancellationToken cancellationToken)
    {
        var own = db.DispatcherNotes.Where(note => note.DispatcherUserId == dispatcherUserId && note.UserId == userId);
        return SetHiddenAsync(
            own,
            hidden,
            () => db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO dispatcher_notes (id, dispatcher_user_id, user_id, notes, hidden)
                VALUES ({Guid.NewGuid()}, {dispatcherUserId}, {userId}, '', true)
                ON CONFLICT (dispatcher_user_id, user_id) DO UPDATE SET hidden = true
                """, cancellationToken),
            cancellationToken);
    }

    private static async Task UpsertAsync<TNote>(
        IQueryable<TNote> own,
        string? notes,
        Func<string, Task> insert,
        CancellationToken cancellationToken) where TNote : class, IViewerNote
    {
        var trimmed = notes?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            var hidden = await own.Select(note => (bool?)note.Hidden).FirstOrDefaultAsync(cancellationToken);
            if (hidden is null)
            {
                return;
            }

            if (hidden.Value)
            {
                await own.ExecuteUpdateAsync(setters => setters.SetProperty(note => note.Notes, ""), cancellationToken);
                return;
            }

            await own.ExecuteDeleteAsync(cancellationToken);
            return;
        }

        await insert(trimmed);
    }

    private static async Task SetHiddenAsync<TNote>(
        IQueryable<TNote> own,
        bool hidden,
        Func<Task> insertHidden,
        CancellationToken cancellationToken) where TNote : class, IViewerNote
    {
        if (hidden)
        {
            await insertHidden();
            return;
        }

        var notes = await own.Select(note => note.Notes).FirstOrDefaultAsync(cancellationToken);
        if (notes is null)
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(notes))
        {
            await own.ExecuteDeleteAsync(cancellationToken);
            return;
        }

        await own.ExecuteUpdateAsync(setters => setters.SetProperty(note => note.Hidden, false), cancellationToken);
    }
}
