import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { fetchDonorBadges, getSession, updateProfilePhoto } from '../services/mockApi';

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

const createCircularProfilePhoto = async (src) => {
  const image = await loadImage(src);
  const size = 720;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  const cropBase = Math.min(image.width, image.height);
  const sx = (image.width - cropBase) / 2;
  const sy = (image.height - cropBase) / 2;
  ctx.drawImage(image, sx, sy, cropBase, cropBase, 0, 0, size, size);
  ctx.restore();

  return canvas.toDataURL('image/png');
};

const downloadBadgeCard = async ({ donorName, bloodGroup, profilePhoto, badge }) => {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 1080, 1080);
  gradient.addColorStop(0, '#180f11');
  gradient.addColorStop(0.6, '#2c1416');
  gradient.addColorStop(1, '#4c1c1b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1080, 1080);

  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath();
  ctx.arc(860, 180, 150, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(220, 850, 210, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(90, 90, 900, 900, 42);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffb39b';
  ctx.font = '700 34px Arial';
  ctx.fillText('BLOODLINK DONOR BADGE', 140, 190);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 88px Arial';
  ctx.fillText(badge.name, 140, 315);

  ctx.fillStyle = '#ffd9ca';
  ctx.font = '38px Arial';
  ctx.fillText(badge.headline, 140, 385);

  const accent = ctx.createLinearGradient(140, 455, 390, 513);
  accent.addColorStop(0, badge.color);
  accent.addColorStop(1, '#ef6a4b');
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(140, 455, 250, 58, 29);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 32px Arial';
  ctx.fillText(`${badge.tier} Tier`, 190, 493);

  if (profilePhoto) {
    try {
      const image = await loadImage(profilePhoto);
      ctx.save();
      ctx.beginPath();
      ctx.arc(830, 580, 110, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(image, 720, 470, 220, 220);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(830, 580, 110, 0, Math.PI * 2);
      ctx.stroke();
    } catch (error) {
      console.error('Failed to load profile photo for badge', error);
    }
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 54px Arial';
  ctx.fillText(donorName || 'BloodLink Donor', 140, 615);
  ctx.fillStyle = '#ffd9ca';
  ctx.font = '34px Arial';
  ctx.fillText(`Blood Group: ${bloodGroup || 'Donor'}`, 140, 675);

  ctx.font = '28px Arial';
  const lines = [badge.description, 'I donated blood and earned this BloodLink badge.', 'Donate. Respond. Save lives.'];
  let y = 760;
  lines.forEach((line, index) => {
    ctx.fillStyle = index === 1 ? '#ffffff' : '#ffd9ca';
    ctx.font = index === 1 ? '700 36px Arial' : '28px Arial';
    ctx.fillText(line, 140, y);
    y += index === 1 ? 62 : 50;
  });

  const url = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = url;
  link.download = `${badge.id}-badge.png`;
  link.click();
};

const Profile = () => {
  const [session, setSession] = useState(() => getSession());
  const [badgeSummary, setBadgeSummary] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(() => getSession()?.profilePhoto || '');
  const [rawPhoto, setRawPhoto] = useState('');
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoError, setPhotoError] = useState('');

  useEffect(() => {
    const id = setInterval(() => setSession(getSession()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setPhotoPreview(session?.profilePhoto || '');
    if (session?.profilePhoto) {
      setRawPhoto('');
    }
  }, [session?.profilePhoto]);

  useEffect(() => {
    if (!session?.id || session.role !== 'Individual donor') return;
    fetchDonorBadges(session.id).then(setBadgeSummary).catch(console.error);
  }, [session?.id, session?.role]);

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  const handlePhotoChange = (event) => {
    if (session?.profilePhoto) return;
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setPhotoError('Please upload an image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setRawPhoto(reader.result);
      setPhotoPreview(reader.result);
      setPhotoError('');
    };
    reader.readAsDataURL(file);
  };

  const savePhoto = async () => {
    if (!photoPreview || !session?.id || session?.profilePhoto) return;
    try {
      setPhotoSaving(true);
      const processedPhoto = await createCircularProfilePhoto(rawPhoto || photoPreview);
      const updated = await updateProfilePhoto({ userId: session.id, profilePhoto: processedPhoto });
      setSession(updated);
      setPhotoPreview(updated.profilePhoto);
      setPhotoError('');
    } catch (error) {
      setPhotoError(error.message || 'Failed to save profile photo.');
    } finally {
      setPhotoSaving(false);
    }
  };

  return (
    <main className="page">
      <section className="hero hero--narrow">
        <p className="eyebrow">Profile</p>
        <h1>Hi {session.name || 'User'}, here are your details.</h1>
        <p className="lead">
          Role-based access powers your experience. Hospitals see search/filter tools, individuals can donate or request blood.
        </p>
      </section>

      <section className="grid">
        <div className="panel">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Identity</p>
              <h3>Account</h3>
            </div>
          </div>

          <div className="profile-photo-card">
            <div className="profile-photo-frame">
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Profile"
                  className="profile-photo-image"
                />
              ) : (
                <div className="profile-photo-placeholder">Add Photo</div>
              )}
            </div>
            <div className="profile-photo-meta">
              <h4>Profile Photo</h4>
              <p className="hint">
                {!session.profilePhoto
                  ? 'Please upload your profile photo now. It will be saved in a circular crop. Once saved, it cannot be changed.'
                  : 'Profile photo is locked after first save.'}
              </p>
              {!session.profilePhoto ? (
                <>
                  <input type="file" accept="image/*" onChange={handlePhotoChange} />
                </>
              ) : null}
              <button type="button" className="btn btn--primary" onClick={savePhoto} disabled={!photoPreview || photoSaving || Boolean(session.profilePhoto)}>
                {photoSaving ? 'Saving...' : 'Save Photo'}
              </button>
              {photoError ? <p className="hint" style={{ color: 'red' }}>{photoError}</p> : null}
            </div>
          </div>

          <div className="inventory-list" style={{ marginTop: '1rem' }}>
            {session.role !== 'Hospital' && (
              <div className="inventory-row">
                <div className="inventory-row__meta">
                  <h4>Name</h4>
                  <p className="hint">{session.name || 'Not provided'}</p>
                </div>
              </div>
            )}
            <div className="inventory-row">
              <div className="inventory-row__meta">
                <h4>Email</h4>
                <p className="hint">{session.email || 'Not provided'}</p>
              </div>
            </div>
            <div className="inventory-row">
              <div className="inventory-row__meta">
                <h4>Contact Number</h4>
                <p className="hint">{session.contactNumber || 'Not provided'}</p>
              </div>
            </div>
            <div className="inventory-row">
              <div className="inventory-row__meta">
                <h4>Role</h4>
                <p className="hint">{session.role || 'Not set'}</p>
              </div>
            </div>

            {session.role === 'Hospital' && (
              <div className="inventory-row">
                <div className="inventory-row__meta">
                  <h4>Organization</h4>
                  <p className="hint">{session.organization || 'Not provided'}</p>
                </div>
              </div>
            )}

            <div className="inventory-row">
              <div className="inventory-row__meta">
                <h4>Address</h4>
                <p className="hint">{session.city || 'Not provided'}</p>
              </div>
            </div>
            {session.location && (
              <div className="inventory-row">
                <div className="inventory-row__meta">
                  <h4>Coordinates</h4>
                  <p className="hint">
                    Lat: {session.location.lat.toFixed(4)}, Lng: {session.location.lng.toFixed(4)}
                  </p>
                </div>
              </div>
            )}

            {session.role === 'Individual donor' && (
              <>
                <div className="inventory-row">
                  <div className="inventory-row__meta">
                    <h4>Blood Group</h4>
                    <p className="hint">{session.bloodGroup || 'Not provided'}</p>
                  </div>
                </div>
                <div className="inventory-row">
                  <div className="inventory-row__meta">
                    <h4>Gender</h4>
                    <p className="hint">{session.gender || 'Not provided'}</p>
                  </div>
                </div>
                <div className="inventory-row">
                  <div className="inventory-row__meta">
                    <h4>Date of Birth</h4>
                    <p className="hint">
                      {session.birthdate ? new Date(session.birthdate).toLocaleDateString() : 'Not provided'}
                    </p>
                  </div>
                </div>
                <div className="inventory-row">
                  <div className="inventory-row__meta">
                    <h4>Donation Status</h4>
                    <p className="hint">
                      {session.isReadyToDonate ? 'Ready to donate (Active on Inventory)' : 'Not actively donating'}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {session.role === 'Individual donor' && badgeSummary ? (
          <div className="panel">
            <div className="panel__header">
              <div>
                <p className="eyebrow">Recognition</p>
                <h3>Donor badge tiers</h3>
                <p className="hint">
                  Completed donations: {badgeSummary.completedAllTime} total · {badgeSummary.completedThisYear} this year
                </p>
              </div>
              <div className="pill pill--ghost">{badgeSummary.unlockedCount} unlocked</div>
            </div>
            <div className="badge-grid">
              {badgeSummary.badges.map((badge) => (
                <div key={badge.id} className={`badge-card ${badge.unlocked ? 'badge-card--unlocked' : 'badge-card--locked'}`}>
                  <div className="badge-card__top">
                    <div className="badge-medal" style={{ '--badge-color': badge.color }}>
                      <span>{badge.tier[0]}</span>
                    </div>
                    <div>
                      <h4>{badge.name}</h4>
                      <p className="hint">{badge.tier} Tier</p>
                    </div>
                  </div>
                  <p className="hint">{badge.headline}</p>
                  <p className="hint">{badge.description}</p>
                  <div className="badge-card__footer">
                    <div className={`pill ${badge.unlocked ? 'pill--success' : 'pill--ghost'}`}>
                      {badge.unlocked ? 'Unlocked' : 'Locked'}
                    </div>
                    {badge.unlocked ? (
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => downloadBadgeCard({
                          donorName: session.name,
                          bloodGroup: session.bloodGroup,
                          profilePhoto: session.profilePhoto,
                          badge,
                        })}
                      >
                        Download PNG
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
};

export default Profile;
