import { useEffect, useState } from 'react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import {
  archiveCustomerCatalogItem,
  createCustomerCatalogItem,
  listCustomerCatalog,
  updateCustomerCatalogItem,
} from '../../api/catalog.api';
import type {
  CustomerCatalogCategory,
  ProductCatalogItem,
} from '../../catalog.types';
import styles from './CustomerFoodMedicationPage.module.css';

/**
 * #22: a customer's own reusable food/medication "types", selectable on
 * future hotel bookings - staff no longer buy food/medication on a
 * customer's behalf, so this moved from a staff-only check-in step to
 * customer-managed CRUD. Reachable standalone (this page, /portal/food-
 * medication) as well as from the hotel booking wizard's Care Instructions
 * step. Global (staff-managed) entries are shown read-only for reference;
 * only the customer's own rows (owner_customer_id = them) can be edited or
 * removed.
 */
export function CustomerFoodMedicationPage() {
  const { user, accessToken } = useAuth();
  const [items, setItems] = useState<ProductCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] =
    useState<CustomerCatalogCategory>('food');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const loadItems = () => {
    if (!accessToken) return;
    void listCustomerCatalog(accessToken).then((result) => {
      setIsLoading(false);
      if (result.data) setItems(result.data);
    });
  };

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          Unable to load your food/medication types.
        </p>
      </main>
    );
  }

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const result = await createCustomerCatalogItem(
      { name: newName.trim(), category: newCategory },
      accessToken
    );

    if (!result.data) {
      setError(result.error ?? 'Could not add this type.');
      return;
    }

    setItems((prev) => [...prev, result.data as ProductCatalogItem]);
    setNewName('');
    setMessage('Added.');
  };

  const handleRename = async (itemId: string) => {
    setError(null);
    const result = await updateCustomerCatalogItem(
      itemId,
      editingName.trim(),
      accessToken
    );

    if (!result.data) {
      setError(result.error ?? 'Could not rename this type.');
      return;
    }

    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? (result.data as ProductCatalogItem) : item
      )
    );
    setEditingId(null);
  };

  const handleRemove = async (itemId: string) => {
    setError(null);
    const result = await archiveCustomerCatalogItem(itemId, accessToken);

    if (result.error) {
      setError(result.error);
      return;
    }

    setItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const renderSection = (category: CustomerCatalogCategory, label: string) => {
    const sectionItems = items.filter((item) => item.category === category);

    return (
      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>{label}</h2>
        {sectionItems.length === 0 ? (
          <p className={styles.copy}>No {label.toLowerCase()} types yet.</p>
        ) : (
          <ul className={styles.itemList}>
            {sectionItems.map((item) => (
              <li key={item.id} className={styles.item}>
                {editingId === item.id ? (
                  <>
                    <input
                      className={styles.input}
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                    />
                    <div className={styles.itemActions}>
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() => void handleRename(item.id)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className={styles.itemName}>{item.name}</span>
                    {item.owner_customer_id === user.id ? (
                      <div className={styles.itemActions}>
                        <button
                          type="button"
                          className={styles.linkButton}
                          onClick={() => {
                            setEditingId(item.id);
                            setEditingName(item.name);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className={styles.linkButton}
                          onClick={() => void handleRemove(item.id)}
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <span className={styles.copy}>Provided by the hotel</span>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  };

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>My Food &amp; Medication Types</h1>
      <p className={styles.copy}>
        Save your pet&apos;s usual food and medication here so you can pick them
        quickly on future hotel bookings.
      </p>

      {message ? <p className={styles.successBanner}>{message}</p> : null}
      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <p className={styles.copy}>Loading...</p>
      ) : (
        <>
          {renderSection('food', 'Food')}
          {renderSection('medication', 'Medication')}
        </>
      )}

      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>Add a new type</h2>
        <form
          className={styles.form}
          onSubmit={(event) => void handleCreate(event)}
        >
          <input
            className={styles.input}
            placeholder="e.g. Chicken kibble, Amoxicillin"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            required
          />
          <select
            className={styles.select}
            value={newCategory}
            onChange={(event) =>
              setNewCategory(event.target.value as CustomerCatalogCategory)
            }
          >
            <option value="food">Food</option>
            <option value="medication">Medication</option>
          </select>
          <button className={styles.button} type="submit">
            Add
          </button>
        </form>
      </section>
    </main>
  );
}
