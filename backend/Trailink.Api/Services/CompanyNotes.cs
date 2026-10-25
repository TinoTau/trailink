using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.Models;

namespace Trailink.Api.Services;

public static class CompanyNotes
{
    public static string DefaultFor(string companyName)
    {
        var name = companyName.Trim();
        return string.Concat(name.EnumerateRunes().Take(2));
    }

    public static async Task<Dictionary<Guid, string>> EnsureAsync(
        TrailinkDbContext db,
        Guid userId,
        IEnumerable<(Guid Id, string Name)> companies,
        CancellationToken cancellationToken)
    {
        var wanted = companies
            .Where(company => !string.IsNullOrWhiteSpace(company.Name))
            .GroupBy(company => company.Id)
            .Select(group => group.First())
            .ToList();
        if (wanted.Count == 0)
        {
            return [];
        }

        var ids = wanted.Select(company => company.Id).ToList();
        var existing = await db.CompanyNotes
            .Where(note => note.UserId == userId && ids.Contains(note.CompanyId))
            .Select(note => note.CompanyId)
            .ToListAsync(cancellationToken);
        var known = existing.ToHashSet();
        var (owners, ownerNotes) = await LoadOwnerNotesAsync(db, ids, cancellationToken);

        foreach (var company in wanted)
        {
            if (!known.Add(company.Id))
            {
                continue;
            }

            var notes = DefaultForNewUser(userId, company.Id, company.Name, owners, ownerNotes);
            if (notes.Length == 0)
            {
                continue;
            }

            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO company_notes (id, company_id, user_id, notes)
                VALUES ({Guid.NewGuid()}, {company.Id}, {userId}, {notes})
                ON CONFLICT (company_id, user_id) DO NOTHING
                """, cancellationToken);
        }

        return await db.CompanyNotes
            .Where(note => note.UserId == userId && ids.Contains(note.CompanyId))
            .ToDictionaryAsync(note => note.CompanyId, note => note.Notes, cancellationToken);
    }

    public static async Task<string> DefaultForUserAsync(
        TrailinkDbContext db,
        Guid userId,
        Guid companyId,
        string companyName,
        CancellationToken cancellationToken)
    {
        var (owners, ownerNotes) = await LoadOwnerNotesAsync(db, [companyId], cancellationToken);
        return DefaultForNewUser(userId, companyId, companyName, owners, ownerNotes);
    }

    private static async Task<(List<(Guid UserId, Guid CompanyId)> Owners, List<(Guid CompanyId, Guid UserId, string Notes)> Notes)> LoadOwnerNotesAsync(
        TrailinkDbContext db,
        IReadOnlyCollection<Guid> companyIds,
        CancellationToken cancellationToken)
    {
        var ownerRows = await db.Users
            .Where(user => user.Role == UserRoles.Company && user.CompanyId != null && companyIds.Contains(user.CompanyId.Value))
            .Select(user => new { user.Id, CompanyId = user.CompanyId!.Value })
            .ToListAsync(cancellationToken);
        var owners = ownerRows.Select(owner => (owner.Id, owner.CompanyId)).ToList();
        if (owners.Count == 0)
        {
            return (owners, []);
        }

        var ownerIds = owners.Select(owner => owner.Id).ToList();
        var noteRows = await db.CompanyNotes
            .Where(note => ownerIds.Contains(note.UserId) && companyIds.Contains(note.CompanyId))
            .Select(note => new { note.CompanyId, note.UserId, note.Notes })
            .ToListAsync(cancellationToken);
        return (owners, noteRows.Select(note => (note.CompanyId, note.UserId, note.Notes)).ToList());
    }

    private static string DefaultForNewUser(
        Guid userId,
        Guid companyId,
        string companyName,
        IReadOnlyList<(Guid UserId, Guid CompanyId)> owners,
        IReadOnlyList<(Guid CompanyId, Guid UserId, string Notes)> ownerNotes)
    {
        var fallback = DefaultFor(companyName);
        var owner = owners.FirstOrDefault(item => item.CompanyId == companyId);
        if (owner.UserId == Guid.Empty || owner.UserId == userId)
        {
            return fallback;
        }

        var saved = ownerNotes.FirstOrDefault(item => item.CompanyId == companyId && item.UserId == owner.UserId).Notes;
        return string.IsNullOrWhiteSpace(saved) ? fallback : saved.Trim();
    }
}
